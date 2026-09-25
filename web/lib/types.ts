// Mirrors publisher/tests/contract/payload.sample.json. Change both together.

export type DayRow = {
  date: string;            // YYYY-MM-DD in that person's local Anki day
  reviews: number;
  minutes: number;
  newCards: number;
  ease1: number;           // "again" -- a lapse
  ease2: number;
  ease3: number;
  ease4: number;
  perDeck: Record<string, number>;
};

export type DeckStatus = "known" | "learning" | "new";
export type WordIndex = Record<DeckStatus, string[]>;
export type FieldRole = "word" | "meaning" | "sentence";
/** One person's choices for one note type. Only overridden roles are present. */
export type FieldMap = Partial<Record<FieldRole, string>>;
/** Note type name -> choices. */
export type FieldMaps = Record<string, FieldMap>;

export type FeedItem = {
  id: string;              // "<userId>:<revlogId>" -- stable across republishes
  user: string;
  front: string;
  back: string;
  deck: string;
  ease: number;
  ivl: number;
  ts: number;              // epoch ms
  /** From publishers that send named fields. Absent on older items. */
  noteType?: string;
  fields?: Record<string, string>;   // may contain <b>…</b>, nothing else
};

export type Profile = {
  id: string;
  displayName: string;
  tz: string;
  joinedAt: number;
  /** A small square data URL, set from the browser. Optional — initials stand in. */
  avatar?: string;
};

export type Meta = {
  lastPublishAt: number;
  streak: number;
  todayKey: string;
  allTimeReviews: number;
  firstReviewAt: number;
};

export type IngestBody = {
  user: string;
  displayName: string;
  tz: string;
  generatedAt: number;
  todayKey: string;
  streak: number;
  days: DayRow[];
  allTime: { reviews: number; firstReviewAt: number };
  recentCards: FeedItem[];
  noteTypes?: Record<string, string[]>;
  /** Left out when unchanged since the last publish. */
  words?: WordIndex;
};

export type Comment = { user: string; text: string; at: number };

/** Banter attached to one card. Absent entirely for cards nobody has touched. */
export type Engagement = {
  /** user id -> emoji. One reaction each, so a second tap replaces the first. */
  reactions: Record<string, string>;
  comments: Comment[];
};

export type PersonView = { profile: Profile; meta: Meta; days: DayRow[] };

export type CrewResponse = {
  viewer: string | null;
  people: PersonView[];
  feed: FeedItem[];
  /** Keyed by feed item id, and only for items that have any. */
  engagement: Record<string, Engagement>;
  /** How far the viewer has read each thread, plus "_floor". See lib/unread. */
  seen: Record<string, number>;
  /** Everyone's field overrides, by user id. */
  fieldMaps?: Record<string, FieldMaps>;
  /** The viewer's own note types and their field names. */
  noteTypes?: Record<string, string[]>;
  /** Friends' cards only: is that word in the viewer's decks. */
  inMyDeck?: Record<string, DeckStatus | "none">;
};
