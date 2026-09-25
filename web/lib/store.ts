import { Redis } from "@upstash/redis";
import type { Comment, DayRow, DeckStatus, Engagement, FeedItem, FieldMap, FieldMaps, IngestBody, Meta, PersonView, Profile } from "@/lib/types";
import { FLOOR, type SeenMap } from "@/lib/unread";

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const FEED_CAP = 500;

const USERS = "crew:users";
const FEED = "feed";
const ENGAGED = "feed:engaged";
export const COMMENT_CAP = 50;
export const MAX_COMMENT_CHARS = 280;

const profileKey = (id: string) => `user:${id}:profile`;
const reactionsKey = (itemId: string) => `reactions:${itemId}`;
const commentsKey = (itemId: string) => `comments:${itemId}`;
const daysKey = (id: string) => `user:${id}:days`;
const metaKey = (id: string) => `user:${id}:meta`;
const seenKey = (id: string) => `seen:${id}`;
const noteTypesKey = (id: string) => `user:${id}:notetypes`;
const wordsKey = (id: string) => `user:${id}:words`;
const fieldMapKey = (id: string) => `user:${id}:fieldmap`;

function parse<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

export async function saveSnapshot(body: IngestBody): Promise<void> {
  const id = body.user;
  await redis.sadd(USERS, id);

  const existing = await redis.get(profileKey(id));
  const prior = existing ? parse<Profile>(existing) : null;
  const joinedAt = prior ? prior.joinedAt : Date.now();
  // The publisher knows nothing about avatars, so a publish must not wipe one.
  const profile: Profile = {
    id, displayName: body.displayName, tz: body.tz, joinedAt,
    ...(prior?.avatar ? { avatar: prior.avatar } : {}),
  };
  await redis.set(profileKey(id), JSON.stringify(profile));

  const meta: Meta = {
    lastPublishAt: body.generatedAt,
    streak: body.streak,
    todayKey: body.todayKey,
    allTimeReviews: body.allTime.reviews,
    firstReviewAt: body.allTime.firstReviewAt,
  };
  await redis.set(metaKey(id), JSON.stringify(meta));

  // One HSET for the entire history. A key per day would cost hundreds of
  // writes per publish and blow the Upstash free tier within a day.
  if (body.days.length > 0) {
    const fields: Record<string, string> = {};
    for (const day of body.days) fields[day.date] = JSON.stringify(day);
    await redis.hset(daysKey(id), fields);
  }

  if (body.recentCards.length > 0) {
    const [first, ...rest] = body.recentCards.map(
      (c) => ({ score: c.ts, member: JSON.stringify({ ...c, user: id }) }),
    );
    await redis.zadd(FEED, first, ...rest);
    await trimFeed();
  }

  if (body.noteTypes) await redis.set(noteTypesKey(id), JSON.stringify(body.noteTypes));

  // Replaced in one transaction so a lookup never sees half an old index.
  // Left alone when the publisher skipped an unchanged one.
  if (body.words) {
    const entries: Record<string, DeckStatus> = {};
    // Best status last, so it wins if a word somehow appears twice.
    for (const status of ["new", "learning", "known"] as const) {
      for (const w of body.words[status]) entries[w] = status;
    }
    const tx = redis.multi();
    tx.del(wordsKey(id));
    if (Object.keys(entries).length > 0) tx.hset(wordsKey(id), entries);
    await tx.exec();
  }
}

async function trimFeed(): Promise<void> {
  const total = await redis.zcard(FEED);
  if (total <= FEED_CAP) return;
  const engaged = new Set(await redis.smembers(ENGAGED));
  const all = await redis.zrange<string[]>(FEED, 0, -1, { rev: true });
  const doomed = all
    .slice(FEED_CAP)
    .filter((raw) => !engaged.has(parse<FeedItem>(raw).id));
  // Eviction assumes JSON.stringify(JSON.parse(raw)) === raw for each stored member.
  // The in-memory mock does not exercise this invariant; future shape changes could
  // silently break feed capping if serialization becomes non-roundtrip-safe.
  if (doomed.length > 0) await redis.zrem(FEED, ...doomed);
}

export async function markEngaged(itemId: string): Promise<void> {
  await redis.sadd(ENGAGED, itemId);
}

export async function listUsers(): Promise<string[]> {
  return (await redis.smembers(USERS)) ?? [];
}

export async function getPerson(id: string): Promise<PersonView | null> {
  const rawProfile = await redis.get(profileKey(id));
  const rawMeta = await redis.get(metaKey(id));
  if (!rawProfile || !rawMeta) return null;
  const hash = await redis.hgetall<Record<string, unknown>>(daysKey(id));
  // Belt and braces: the ingest route rejects dateless rows now, but a row
  // written before it did is undeletable, and sorting it would throw and 500
  // the dashboard for all three viewers on every load.
  const days: DayRow[] = hash
    ? Object.values(hash).map((v) => parse<DayRow>(v))
        .filter((d) => typeof d?.date === "string")
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return { profile: parse<Profile>(rawProfile), meta: parse<Meta>(rawMeta), days };
}

export async function getFeed(limit = FEED_CAP): Promise<FeedItem[]> {
  const raw = await redis.zrange<string[]>(FEED, 0, limit - 1, { rev: true });
  // The whole serialized item is the ZSET member, so a card republished with
  // changed content (a fixed typo, a moved deck, a "Set Due Date" that alters
  // ivl, or a publisher upgrade that adds fields) is stored twice under one
  // id. Descending score means the first occurrence of an id is the newest,
  // but a later, older copy with fields still beats an earlier one without.
  const byId = new Map<string, FeedItem>();
  for (const r of raw) {
    const item = parse<FeedItem>(r);
    const kept = byId.get(item.id);
    // After a publisher update the same card is stored twice, once with named
    // fields. The richer copy wins whatever order Redis returns them in.
    if (!kept || (!kept.fields && item.fields)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/* ------------------------------------------------------------- engagement */

/**
 * One reaction per person per card. Tapping the same emoji again clears it,
 * which is why this is a field-per-user hash rather than a list per emoji:
 * setting and clearing are both a single command with nothing to reconcile.
 */
export async function setReaction(itemId: string, userId: string, emoji: string | null): Promise<void> {
  if (emoji === null) {
    await redis.hdel(reactionsKey(itemId), userId);
    return;
  }
  await redis.hset(reactionsKey(itemId), { [userId]: emoji });
  await markEngaged(itemId);
}

export async function addComment(itemId: string, comment: Comment): Promise<void> {
  await redis.lpush(commentsKey(itemId), JSON.stringify(comment));
  await redis.ltrim(commentsKey(itemId), 0, COMMENT_CAP - 1);
  await markEngaged(itemId);
}

/**
 * Banter for the cards that have any. Quiet cards cost nothing: the engaged set
 * is one read, and only ids in it are looked up.
 */
export async function getEngagement(itemIds: string[]): Promise<Record<string, Engagement>> {
  const engaged = new Set((await redis.smembers(ENGAGED)) ?? []);
  const wanted = itemIds.filter((id) => engaged.has(id));
  const out: Record<string, Engagement> = {};
  for (const id of wanted) {
    const reactions = (await redis.hgetall<Record<string, string>>(reactionsKey(id))) ?? {};
    const rawComments = await redis.lrange<string[]>(commentsKey(id), 0, COMMENT_CAP - 1);
    const comments = (rawComments ?? [])
      .map((c) => parse<Comment>(c))
      .filter((c) => c && typeof c.text === "string")
      .sort((a, b) => a.at - b.at);
    if (Object.keys(reactions).length > 0 || comments.length > 0) {
      out[id] = { reactions, comments };
    }
  }
  return out;
}

/* ------------------------------------------------------------- read state */

/**
 * How far `userId` has read each thread, plus their floor. There is no starting
 * cutoff: a comment is unread until its thread is opened, however old it is
 * and however late you joined. Only Mark all read raises the floor.
 */
export async function getSeen(userId: string): Promise<SeenMap> {
  const raw = (await redis.hgetall<Record<string, unknown>>(seenKey(userId))) ?? {};
  const out: SeenMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  out[FLOOR] = out[FLOOR] ?? 0;
  return out;
}

/**
 * Read times only go forward. A phone that loaded an hour ago must not undo
 * what the laptop just read. Read-then-write can race, but only between two of
 * your own devices inside one request, and whichever wins is still a read.
 */
async function raise(userId: string, field: string, at: number): Promise<void> {
  const cur = Number((await redis.hget(seenKey(userId), field)) ?? 0);
  if (at > cur) await redis.hset(seenKey(userId), { [field]: at });
}

export async function markSeen(userId: string, itemId: string, at: number): Promise<void> {
  await raise(userId, itemId, at);
}

export async function markAllSeen(userId: string, at: number): Promise<void> {
  await raise(userId, FLOOR, at);
}

/* ----------------------------------------------------------------- avatar */

export async function setAvatar(userId: string, avatar: string): Promise<boolean> {
  const raw = await redis.get(profileKey(userId));
  if (!raw) return false;
  const profile = parse<Profile>(raw);
  await redis.set(profileKey(userId), JSON.stringify({ ...profile, avatar }));
  return true;
}

/* ------------------------------------------------------ fields and words */

export async function getNoteTypes(id: string): Promise<Record<string, string[]>> {
  const raw = await redis.get(noteTypesKey(id));
  return raw ? parse<Record<string, string[]>>(raw) : {};
}

/**
 * Which of `words` are in this person's decks, and at what stage. Null when
 * they have no index at all (not updated yet), so the caller can show no
 * badge rather than "not in your deck" everywhere.
 */
export async function getWordStatuses(id: string, words: string[]): Promise<Record<string, DeckStatus> | null> {
  if ((await redis.exists(wordsKey(id))) === 0) return null;
  if (words.length === 0) return {};
  const got = (await redis.hmget<Record<string, unknown>>(wordsKey(id), ...words)) ?? {};
  const out: Record<string, DeckStatus> = {};
  for (const [w, s] of Object.entries(got)) {
    if (s === "known" || s === "learning" || s === "new") out[w] = s;
  }
  return out;
}

export async function getFieldMaps(id: string): Promise<FieldMaps> {
  const raw = await redis.get(fieldMapKey(id));
  return raw ? parse<FieldMaps>(raw) : {};
}

export async function setFieldMap(id: string, noteType: string, map: FieldMap): Promise<FieldMaps> {
  const all = await getFieldMaps(id);
  if (Object.keys(map).length === 0) delete all[noteType]; else all[noteType] = map;
  await redis.set(fieldMapKey(id), JSON.stringify(all));
  return all;
}
