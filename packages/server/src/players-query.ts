import type { Player, PlayerSummary, PlayersQuery, PlayersResponse, SortDir, SortField } from '@shared/types';

/**
 * Pure functions for filtering, sorting and paginating an in-memory list of
 * players. Kept free of Express so they can be unit tested directly.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const SORT_FIELDS: ReadonlyArray<SortField> = [
  'last_name',
  'first_name',
  'position',
  'status',
  'team',
];

export interface NormalizedQuery {
  q: string;
  position: string | null;
  team: string | null;
  status: string | null;
  sort: SortField;
  dir: SortDir;
  page: number;
  limit: number;
  favoritesOnly: boolean;
  favoriteIds: Set<string>;
  /**
   * If true, queries run against the full Sleeper feed (retired, historical,
   * non-fantasy entries included). Defaults to false so the UI shows a clean
   * list of currently usable players.
   */
  includeInactive: boolean;
}

export function normalizeQuery(input: PlayersQuery | Record<string, unknown>): NormalizedQuery {
  const get = (key: string): string | undefined => {
    const v = (input as Record<string, unknown>)[key];
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v)) return typeof v[0] === 'string' ? (v[0] as string) : undefined;
    return typeof v === 'string' ? v : String(v);
  };

  const sortRaw = (get('sort') ?? 'last_name') as SortField;
  const sort: SortField = SORT_FIELDS.includes(sortRaw) ? sortRaw : 'last_name';
  const dir: SortDir = get('dir') === 'desc' ? 'desc' : 'asc';

  const page = clampInt(get('page'), 1, Number.MAX_SAFE_INTEGER, 1);
  const limit = clampInt(get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);

  const favoritesOnly = get('favoritesOnly') === 'true' || get('favoritesOnly') === '1';
  const favoriteIdsRaw = get('favoriteIds') ?? '';
  const favoriteIds = new Set(
    favoriteIdsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 500), // cap at 500 favorites
  );

  const includeInactive =
    get('includeInactive') === 'true' || get('includeInactive') === '1';

  return {
    q: (get('q') ?? '').trim().toLowerCase(),
    position: nullIfEmpty(get('position')),
    team: nullIfEmpty(get('team')),
    status: nullIfEmpty(get('status')),
    sort,
    dir,
    page,
    limit,
    favoritesOnly,
    favoriteIds,
    includeInactive,
  };
}

function clampInt(v: string | undefined, min: number, max: number, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function nullIfEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'all' ? null : trimmed;
}

export function applyQuery(players: Player[], q: NormalizedQuery): {
  players: Player[];
  total: number;
  totalPages: number;
} {
  // 1) Filter
  let filtered = players;

  if (q.favoritesOnly) {
    filtered = filtered.filter((p) => q.favoriteIds.has(p.player_id));
  }
  if (q.position) {
    filtered = filtered.filter(
      (p) => (p.position ?? '').toLowerCase() === q.position!.toLowerCase(),
    );
  }
  if (q.team) {
    filtered = filtered.filter((p) => (p.team ?? '').toLowerCase() === q.team!.toLowerCase());
  }
  if (q.status) {
    filtered = filtered.filter((p) => (p.status ?? '').toLowerCase() === q.status!.toLowerCase());
  }
  if (q.q) {
    const needle = q.q;
    filtered = filtered.filter((p) => playerMatchesSearch(p, needle));
  }

  // 2) Sort
  const sorted = [...filtered].sort((a, b) => compareBy(a, b, q.sort, q.dir));

  // 3) Paginate
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / q.limit));
  const start = (q.page - 1) * q.limit;
  const pageItems = sorted.slice(start, start + q.limit);

  return { players: pageItems, total, totalPages };
}

function playerMatchesSearch(p: Player, needle: string): boolean {
  // Keep search permissive — match across the most useful identity fields.
  const haystacks: Array<string | null | undefined> = [
    p.first_name,
    p.last_name,
    p.full_name,
    p.search_full_name,
    p.team,
    p.position,
  ];
  for (const h of haystacks) {
    if (h && h.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function compareBy(a: Player, b: Player, field: SortField, dir: SortDir): number {
  const av = stringField(a, field);
  const bv = stringField(b, field);

  // Push nulls/empties to the end regardless of direction so the visible page
  // is always populated with real data first.
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;

  const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

function stringField(p: Player, field: SortField): string {
  const v = p[field];
  return typeof v === 'string' ? v : '';
}

export function toPlayerSummary(p: Player): PlayerSummary {
  const summary: PlayerSummary = {
    player_id: p.player_id,
    first_name: p.first_name,
    last_name: p.last_name,
    full_name: p.full_name,
    position: p.position,
    team: p.team,
    status: p.status,
    age: p.age,
    height: p.height,
    weight: p.weight,
    years_exp: p.years_exp,
    college: p.college,
    jersey_number: p.jersey_number,
    injury_status: p.injury_status,
    search_full_name: p.search_full_name,
  };
  return summary;
}

export function buildResponse(
  players: Player[],
  total: number,
  totalPages: number,
  q: NormalizedQuery,
  cachedAt: Date | null,
  facets: PlayersResponse['facets'],
  source: PlayersResponse['source'],
): PlayersResponse {
  return {
    players: players.map(toPlayerSummary),
    total,
    page: q.page,
    limit: q.limit,
    totalPages,
    cachedAt: cachedAt ? cachedAt.toISOString() : null,
    facets,
    source,
  };
}
