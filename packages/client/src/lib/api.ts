import type { PlayersResponse } from '@shared/types';

export interface FetchPlayersParams {
  q: string;
  position: string;
  team: string;
  status: string;
  sort: string;
  dir: string;
  page: number;
  limit: number;
  favoritesOnly: boolean;
  favoriteIds: string[];
  includeInactive: boolean;
}

export async function fetchPlayers(
  params: FetchPlayersParams,
  signal?: AbortSignal,
): Promise<PlayersResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.position) search.set('position', params.position);
  if (params.team) search.set('team', params.team);
  if (params.status) search.set('status', params.status);
  search.set('sort', params.sort);
  search.set('dir', params.dir);
  search.set('page', String(params.page));
  search.set('limit', String(params.limit));
  if (params.favoritesOnly) {
    search.set('favoritesOnly', 'true');
    if (params.favoriteIds.length) {
      search.set('favoriteIds', params.favoriteIds.join(','));
    }
  }
  if (params.includeInactive) {
    search.set('includeInactive', 'true');
  }

  const res = await fetch(`/api/players?${search.toString()}`, { signal });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || body?.error || '';
    } catch {
      // ignore
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as PlayersResponse;
}
