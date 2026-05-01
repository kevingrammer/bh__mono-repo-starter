import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import type { Player, PlayersResponse, SortDir, SortField } from '@shared/types';
import PlayersTable from '@/components/PlayersTable';
import PlayerDetailModal from '@/components/PlayerDetailModal';
import { fetchPlayers } from '@/lib/api';
import { useDebounced } from '@/lib/useDebounced';
import { useFavorites } from '@/lib/useFavorites';

const PAGE_SIZE = 25;

export default function Home() {
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput, 300);

  const [position, setPosition] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState('');

  const [sort, setSort] = useState<SortField>('last_name');
  const [dir, setDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const favorites = useFavorites();

  const [data, setData] = useState<PlayersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Player | null>(null);

  // Reset to page 1 whenever a filter or search changes so the user isn't
  // stuck on an empty page after narrowing the result set.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, position, team, status, favoritesOnly, includeInactive]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!favorites.hydrated) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    fetchPlayers(
      {
        q: debouncedSearch.trim(),
        position,
        team,
        status,
        sort,
        dir,
        page,
        limit: PAGE_SIZE,
        favoritesOnly,
        favoriteIds: favorites.ids,
        includeInactive,
      },
      ctrl.signal,
    )
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setLoading(false);
      });

    return () => ctrl.abort();
  }, [
    debouncedSearch,
    position,
    team,
    status,
    sort,
    dir,
    page,
    favoritesOnly,
    favorites.ids,
    favorites.hydrated,
    includeInactive,
  ]);

  const onSortChange = useCallback(
    (field: SortField) => {
      if (field === sort) {
        setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSort(field);
        setDir('asc');
      }
    },
    [sort],
  );

  const positionOptions = data?.facets.positions ?? [];
  const teamOptions = data?.facets.teams ?? [];
  const statusOptions = data?.facets.statuses ?? [];

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const showingRange = useMemo(() => {
    if (!data || data.players.length === 0) return '0';
    const start = (data.page - 1) * data.limit + 1;
    const end = start + data.players.length - 1;
    return `${start.toLocaleString()}–${end.toLocaleString()}`;
  }, [data]);

  return (
    <>
      <Head>
        <title>NFL Players · Sleeper Browser</title>
      </Head>
      <main className="container">
        <header className="page-header">
          <div>
            <h1>NFL Players</h1>
            <p className="muted">Live data from the Sleeper API. Cached on the server.</p>
          </div>
          {data?.cachedAt && (
            <p className="muted small">
              Cached at {new Date(data.cachedAt).toLocaleTimeString()}
            </p>
          )}
        </header>

        <section className="controls" aria-label="Filters">
          <input
            type="search"
            placeholder="Search by name, team, position…"
            className="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search players"
          />
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            aria-label="Filter by position"
          >
            <option value="">All positions</option>
            {positionOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label="Filter by team"
          >
            <option value="">All teams</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="toggle">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            <span>Favorites only ({favorites.ids.length})</span>
          </label>
          <label
            className="toggle"
            title="Sleeper's feed includes retired and historical players. Hidden by default."
          >
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            <span>Include inactive / historical</span>
          </label>
        </section>

        <section className="meta-bar">
          <span className="muted small">
            {loading ? 'Loading…' : `Showing ${showingRange} of ${total.toLocaleString()}`}
            {data?.source && !includeInactive && data.source.rawCount > data.source.usableCount ? (
              <>
                {' '}· {data.source.usableCount.toLocaleString()} usable of{' '}
                {data.source.rawCount.toLocaleString()} in feed
              </>
            ) : null}
          </span>
          {(debouncedSearch || position || team || status || favoritesOnly || includeInactive) && (
            <button
              className="link"
              onClick={() => {
                setSearchInput('');
                setPosition('');
                setTeam('');
                setStatus('');
                setFavoritesOnly(false);
                setIncludeInactive(false);
              }}
            >
              Clear filters
            </button>
          )}
        </section>

        {error ? (
          <div className="alert error" role="alert">
            <strong>Couldn’t load players.</strong>
            <p>{error}</p>
            <button
              className="primary"
              onClick={() => {
                // Force a refetch by toggling sort dir back-and-forth would
                // be ugly; just call setPage(p=>p) to retrigger the effect.
                setError(null);
                setPage((p) => p);
              }}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="loading-skeleton" aria-busy="true">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : data && data.players.length === 0 ? (
          <div className="empty">
            <p>No players match these filters.</p>
          </div>
        ) : data ? (
          <PlayersTable
            players={data.players}
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
            onRowClick={setSelected}
            isFavorite={favorites.has}
            onToggleFavorite={favorites.toggle}
          />
        ) : null}

        {data && data.totalPages > 1 ? (
          <nav className="pagination" aria-label="Pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Prev
            </button>
            <span className="muted small">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </nav>
        ) : null}

        <PlayerDetailModal
          player={selected}
          onClose={() => setSelected(null)}
          isFavorite={selected ? favorites.has(selected.player_id) : false}
          onToggleFavorite={favorites.toggle}
        />
      </main>
    </>
  );
}
