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

export type FeedItem = {
  id: string;              // "<userId>:<revlogId>" -- stable across republishes
  user: string;
  front: string;
  back: string;
  deck: string;
  ease: number;
  ivl: number;
  ts: number;              // epoch ms
};

export type Profile = { id: string; displayName: string; tz: string; joinedAt: number };

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
};

export type PersonView = { profile: Profile; meta: Meta; days: DayRow[] };
export type CrewResponse = { viewer: string | null; people: PersonView[]; feed: FeedItem[] };
