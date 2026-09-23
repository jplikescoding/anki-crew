// Secrets live in env as JSON maps, e.g. INGEST_TOKENS={"tok_jp":"jp"}.
// One token per person means a leaked token can be rotated for one person
// without disturbing the others.

function lookup(raw: string | undefined, key: string): string | null {
  if (!raw || !key) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  if (!Object.prototype.hasOwnProperty.call(parsed, key)) return null;
  const value = (parsed as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function userForIngestToken(token: string): string | null {
  return lookup(process.env.INGEST_TOKENS, token);
}

export function userForReadKey(key: string): string | null {
  return lookup(process.env.READ_KEYS, key);
}

/**
 * The person behind a request, from the `key` in the query string.
 *
 * The read key doubles as a write credential. Anyone holding a link can already
 * see everything on it, so the key is the identity; a second secret per person
 * would add distribution work and protect nothing.
 */
export function userForRequest(req: Request): string | null {
  try {
    return userForReadKey(new URL(req.url).searchParams.get("key") ?? "");
  } catch {
    return null;
  }
}
