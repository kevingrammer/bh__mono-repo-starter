/**
 * Shared types used by both the server and the client.
 *
 * The Sleeper /v1/players/nfl endpoint returns an object keyed by `player_id`.
 * Many fields are nullable, missing, or empty strings, so we keep the type
 * permissive and surface only the bits the UI cares about as required.
 */

export type SortField = 'last_name' | 'first_name' | 'position' | 'status' | 'team';
export type SortDir = 'asc' | 'desc';

/**
 * Lightweight summary of a player for list/table views.
 * Includes only fields used in the UI table and basic metadata.
 */
export interface PlayerSummary {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name?: string | null;
  position: string | null;
  team: string | null;
  status: string | null;
  age?: number | null;
  height?: string | null;
  weight?: string | null;
  years_exp?: number | null;
  college?: string | null;
  jersey_number?: number | null;
  injury_status?: string | null;
  search_full_name?: string | null;
}

/**
 * Full player record from Sleeper, including all metadata.
 * Used in detail views and kept in server-side cache.
 */
export interface Player extends PlayerSummary {
  /** Sleeper sets `active: false` for retired / historical players. */
  active?: boolean | null;
  /** Empty/missing for non-fantasy-relevant entries (e.g. some defenses). */
  fantasy_positions?: string[] | null;

  // Additional metadata fields from Sleeper
  birth_date?: string | null;
  depth_chart_position?: string | null;
  depth_chart_order?: number | null;
  injury_body_part?: string | null;
  number?: number | null;
  hashtag?: string | null;
}

export interface PlayersQuery {
  q?: string;
  position?: string;
  team?: string;
  status?: string;
  sort?: SortField;
  dir?: SortDir;
  page?: number;
  limit?: number;
  favoritesOnly?: boolean;
  favoriteIds?: string[];
  /**
   * By default the API only surfaces "usable" players (active && has position
   * && has fantasy_positions). Set this true to include retired, historical
   * and otherwise un-rosterable players.
   */
  includeInactive?: boolean;
}

export interface PlayersResponse {
  players: PlayerSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** ISO timestamp for when the underlying Sleeper data was last refreshed. */
  cachedAt: string | null;
  /** Available filter values derived from the active dataset (post quirk filter). */
  facets: {
    positions: string[];
    teams: string[];
    statuses: string[];
  };
  /** How many records the underlying Sleeper feed returned vs how many we kept. */
  source: {
    rawCount: number;
    usableCount: number;
    includedInactive: boolean;
  };
}

export interface PlayerDetailResponse {
  player: Player;
  cachedAt: string | null;
}

export interface ApiError {
  error: string;
  message?: string;
}
