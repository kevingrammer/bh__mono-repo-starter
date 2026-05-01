import type { Player } from '@shared/types';

/**
 * In-memory cache for the Sleeper /v1/players/nfl response.
 *
 * The endpoint returns a giant object (~5–10MB) keyed by `player_id`, and
 * Sleeper recommends polling at most once per day. We:
 *  - cache the whole normalized list with a 12-hour TTL
 *  - share a single in-flight promise so concurrent callers don't fan out
 *  - pre-compute the "usable" subset (active && position && fantasy_positions)
 *    so the default API view isn't polluted with retired/historical entries
 *
 * Quirks the normalizer accounts for:
 *  - top-level shape is an object, not an array
 *  - `player_id` is a string and can look like a number ("1042") or a team
 *    defense code ("CAR") for D/ST entries
 *  - lots of nulls, empty strings, missing fields, and stringified numbers
 *    (e.g. weight: "220")
 *  - `team`, `status`, and depth-chart fields aren't always current; we treat
 *    them as display metadata, not source of truth
 *  - `active` distinguishes current rosterable players from retired ones
 *  - some defenses lack `fantasy_positions` so they fall out of the default
 *    "usable" filter — fine for an NFL player browser, and the includeInactive
 *    opt-out brings them back if needed
 */

const SLEEPER_URL = 'https://api.sleeper.app/v1/players/nfl';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// Exponential backoff: 30s, 1m, 2m, 4m, … capped at 10 minutes.
const BACKOFF_BASE_MS = 1000 * 30;
const BACKOFF_MAX_MS = 1000 * 60 * 10;

export interface CacheEntry {
  /** All normalized players, including retired / historical / non-fantasy. */
  allPlayers: Player[];
  /** Players that pass the default "usable" quirk filter. */
  usablePlayers: Player[];
  cachedAt: Date;
  /** Facets derived from the usable subset (matches default API view). */
  facets: {
    positions: string[];
    teams: string[];
    statuses: string[];
  };
}

interface CacheOptions {
  ttlMs?: number;
  fetchImpl?: typeof fetch;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;
let options: Required<CacheOptions> = {
  ttlMs: DEFAULT_TTL_MS,
  fetchImpl: fetch,
};
let failureCount = 0;
let nextRetryAt = 0; // epoch ms; 0 means "retry immediately"

export function configureCache(opts: CacheOptions): void {
  options = { ...options, ...opts } as Required<CacheOptions>;
}

export function clearCache(): void {
  cache = null;
  inflight = null;
  failureCount = 0;
  nextRetryAt = 0;
}

export function peekCache(): CacheEntry | null {
  return cache;
}

/**
 * Convert the keyed Sleeper object into a normalized array of Player records.
 * Explicitly picks known fields rather than spreading to prevent prototype pollution.
 */
export function normalizePlayers(raw: Record<string, Record<string, unknown>>): Player[] {
  const out: Player[] = [];
  for (const [id, record] of Object.entries(raw)) {
    if (!record || typeof record !== 'object') continue;
    const player: Player = {
      // Core identity
      player_id: id,
      // Summary fields
      first_name: emptyToNull(record.first_name),
      last_name: emptyToNull(record.last_name),
      full_name: emptyToNull(record.full_name) ?? null,
      position: emptyToNull(record.position),
      team: emptyToNull(record.team),
      status: emptyToNull(record.status),
      // Metadata
      active: typeof record.active === 'boolean' ? record.active : null,
      fantasy_positions: normalizeFantasyPositions(record.fantasy_positions),
      age: typeof record.age === 'number' ? record.age : null,
      height: emptyToNull(record.height),
      weight: emptyToNull(record.weight),
      years_exp: typeof record.years_exp === 'number' ? record.years_exp : null,
      college: emptyToNull(record.college),
      birth_date: emptyToNull(record.birth_date),
      jersey_number: typeof record.jersey_number === 'number' ? record.jersey_number : null,
      depth_chart_position: emptyToNull(record.depth_chart_position),
      depth_chart_order: typeof record.depth_chart_order === 'number' ? record.depth_chart_order : null,
      injury_status: emptyToNull(record.injury_status),
      injury_body_part: emptyToNull(record.injury_body_part),
      number: typeof record.number === 'number' ? record.number : null,
      search_full_name: emptyToNull(record.search_full_name),
      hashtag: emptyToNull(record.hashtag),
    };
    out.push(player);
  }
  return out;
}

function normalizeFantasyPositions(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return arr.length ? arr : null;
}

function emptyToNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  return String(v);
}

/**
 * Per the Sleeper docs, the feed includes retired / historical / free-agent
 * entries that an NFL player UI doesn't usually want. Default "usable" view:
 *
 *   p.active === true && p.position && p.fantasy_positions?.length
 *   && fantasy_positions doesn't only contain 'DEF' (team defenses)
 *
 * This drops:
 *   - retired / historical players (active === false)
 *   - records with no recognizable position
 *   - team defenses (fantasy_positions: ['DEF'])
 *   - non-fantasy entries (kicker-of-the-week placeholders, etc.)
 */
export function isUsable(p: Player): boolean {
  if (p.active !== true) return false;
  if (!p.position) return false;
  if (!Array.isArray(p.fantasy_positions) || p.fantasy_positions.length === 0) return false;
  // Exclude team defenses — they only have 'DEF' as a fantasy position
  if (p.fantasy_positions.length === 1 && p.fantasy_positions[0] === 'DEF') return false;
  return true;
}

export function deriveFacets(players: Player[]): CacheEntry['facets'] {
  const positions = new Set<string>();
  const teams = new Set<string>();
  const statuses = new Set<string>();
  for (const p of players) {
    if (p.position) positions.add(p.position);
    if (p.team) teams.add(p.team);
    if (p.status) statuses.add(p.status);
  }
  return {
    positions: Array.from(positions).sort(),
    teams: Array.from(teams).sort(),
    statuses: Array.from(statuses).sort(),
  };
}

export async function getPlayers(force = false): Promise<CacheEntry> {
  const now = Date.now();
  if (!force && cache && now - cache.cachedAt.getTime() < options.ttlMs) {
    return cache;
  }
  if (inflight) return inflight;

  // If the last fetch failed and we're still within the backoff window,
  // serve stale data rather than hammering Sleeper while it's down.
  if (!force && failureCount > 0 && now < nextRetryAt) {
    if (cache) {
      const retryInSec = Math.round((nextRetryAt - now) / 1000);
      console.warn(
        `[players-cache] In backoff after ${failureCount} failure(s). ` +
          `Serving stale cache. Retry in ${retryInSec}s.`,
      );
      return cache;
    }
    // No stale data at all — have to try anyway.
  }

  inflight = (async () => {
    const res = await options.fetchImpl(SLEEPER_URL);
    if (!res.ok) {
      throw new Error(`Sleeper responded with ${res.status} ${res.statusText}`);
    }
    const raw = (await res.json()) as Record<string, Record<string, unknown>>;
    const allPlayers = normalizePlayers(raw);
    const usablePlayers = allPlayers.filter(isUsable);
    const entry: CacheEntry = {
      allPlayers,
      usablePlayers,
      cachedAt: new Date(),
      facets: deriveFacets(usablePlayers),
    };
    cache = entry;
    return entry;
  })();

  try {
    const entry = await inflight;
    // Successful fetch — reset backoff.
    failureCount = 0;
    nextRetryAt = 0;
    return entry;
  } catch (err) {
    // Increment backoff: delay doubles each failure, capped at BACKOFF_MAX_MS.
    failureCount += 1;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failureCount - 1), BACKOFF_MAX_MS);
    nextRetryAt = Date.now() + delay;
    const delaySec = Math.round(delay / 1000);

    if (cache) {
      const ageMin = Math.round((Date.now() - cache.cachedAt.getTime()) / 60_000);
      console.warn(
        `[players-cache] Sleeper fetch failed (${(err as Error).message}). ` +
          `Failure #${failureCount}; next retry in ${delaySec}s. ` +
          `Serving stale cache from ${ageMin} minute(s) ago.`,
      );
      return cache;
    }
    throw err;
  } finally {
    inflight = null;
  }
}
