import { Redis } from "@upstash/redis";
import type { DayRow, FeedItem, IngestBody, Meta, PersonView, Profile } from "@/lib/types";

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const FEED_CAP = 500;

const USERS = "crew:users";
const FEED = "feed";
const ENGAGED = "feed:engaged";
const profileKey = (id: string) => `user:${id}:profile`;
const daysKey = (id: string) => `user:${id}:days`;
const metaKey = (id: string) => `user:${id}:meta`;

function parse<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

export async function saveSnapshot(body: IngestBody): Promise<void> {
  const id = body.user;
  await redis.sadd(USERS, id);

  const existing = await redis.get(profileKey(id));
  const joinedAt = existing ? parse<Profile>(existing).joinedAt : Date.now();
  const profile: Profile = { id, displayName: body.displayName, tz: body.tz, joinedAt };
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
    await redis.zadd(
      FEED,
      ...body.recentCards.map((c) => ({ score: c.ts, member: JSON.stringify({ ...c, user: id }) })),
    );
    await trimFeed();
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
  if (!rawProfile) return null;
  const rawMeta = await redis.get(metaKey(id));
  const hash = await redis.hgetall<Record<string, unknown>>(daysKey(id));
  const days: DayRow[] = hash
    ? Object.values(hash).map((v) => parse<DayRow>(v)).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return { profile: parse<Profile>(rawProfile), meta: parse<Meta>(rawMeta), days };
}

export async function getFeed(limit = FEED_CAP): Promise<FeedItem[]> {
  const raw = await redis.zrange<string[]>(FEED, 0, limit - 1, { rev: true });
  return raw.map((r) => parse<FeedItem>(r));
}
