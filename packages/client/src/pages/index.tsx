import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import type { SelectChangeEvent } from '@mui/material/Select';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MuiPagination from '@mui/material/Pagination';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import type { Player, PlayersResponse, SortDir, SortField } from '@shared/types';
import PlayersTable from '@/components/PlayersTable';
import PlayerDetailModal from '@/components/PlayerDetailModal';
import { fetchPlayers, fetchPlayerDetail } from '@/lib/api';
import { useDebounced } from '@/lib/useDebounced';
import { useFavorites } from '@/lib/useFavorites';
import { useAppTheme } from '@/lib/ThemeContext';

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
  const { mode, toggleTheme } = useAppTheme();

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

  const onRowClick = useCallback((playerId: string) => {
    fetchPlayerDetail(playerId)
      .then((player) => setSelected(player))
      .catch((err) => console.error('Failed to fetch player details:', err));
  }, []);

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
            <p className="muted">Live data from the Sleeper API.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <IconButton
              onClick={toggleTheme}
              title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
              aria-label="Toggle dark mode"
            >
              {mode === 'light' ? <Brightness4Icon /> : <Brightness7Icon />}
            </IconButton>
          </div>
        </header>

        <section className="controls" aria-label="Filters">
          <TextField
            size="small"
            placeholder="Search by name, team, position…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            slotProps={{ input: { 'aria-label': 'Search players' } }}
          />
          <Autocomplete
            size="small"
            options={positionOptions}
            value={position || null}
            onChange={(_, val) => setPosition(val ?? '')}
            renderInput={(params) => (
              <TextField {...params} placeholder="All positions" aria-label="Filter by position" />
            )}
            sx={{ minWidth: 160 }}
          />
          <Autocomplete
            size="small"
            options={teamOptions}
            value={team || null}
            onChange={(_, val) => setTeam(val ?? '')}
            renderInput={(params) => (
              <TextField {...params} placeholder="All teams" aria-label="Filter by team" />
            )}
            sx={{ minWidth: 160 }}
          />
          <FormControl size="small">
            <Select
              value={status}
              onChange={(e: SelectChangeEvent) => setStatus(e.target.value)}
              displayEmpty
              inputProps={{ 'aria-label': 'Filter by status' }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {statusOptions.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
                size="small"
              />
            }
            label={`Favorites only (${favorites.ids.length})`}
          />
          <FormControlLabel
            title="Sleeper's feed includes retired and historical players. Hidden by default."
            control={
              <Checkbox
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                size="small"
              />
            }
            label="Include inactive / historical"
          />
        </section>

        <section className="meta-bar">
          <span className="muted small">
            {loading ? 'Loading…' : `Showing ${showingRange} of ${total.toLocaleString()}`}
          </span>
          {(debouncedSearch || position || team || status || favoritesOnly || includeInactive) && (
            <Button
              variant="text"
              size="small"
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
            </Button>
          )}
        </section>

        {error ? (
          <div className="alert error" role="alert">
            <strong>Couldn’t load players.</strong>
            <p>{error}</p>
            <Button
              variant="contained"
              onClick={() => {
                // Force a refetch by toggling sort dir back-and-forth would
                // be ugly; just call setPage(p=>p) to retrigger the effect.
                setError(null);
                setPage((p) => p);
              }}
            >
              Retry
            </Button>
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
            onRowClick={onRowClick}
            isFavorite={favorites.has}
            onToggleFavorite={favorites.toggle}
          />
        ) : null}

        {data && data.totalPages > 1 ? (
          <nav className="pagination" aria-label="Pagination">
            <MuiPagination
              count={totalPages}
              page={page}
              onChange={(_, p) => setPage(p)}
              siblingCount={1}
            />
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
