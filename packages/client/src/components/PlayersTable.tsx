import type { Player, SortDir, SortField } from '@shared/types';

interface Props {
  players: Player[];
  sort: SortField;
  dir: SortDir;
  onSortChange: (field: SortField) => void;
  onRowClick: (p: Player) => void;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
}

const COLUMNS: Array<{ key: SortField; label: string }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'position', label: 'Position' },
  { key: 'status', label: 'Status' },
  { key: 'team', label: 'Team' },
];

export default function PlayersTable({
  players,
  sort,
  dir,
  onSortChange,
  onRowClick,
  isFavorite,
  onToggleFavorite,
}: Props) {
  return (
    <div className="table-wrap">
      <table className="players-table">
        <thead>
          <tr>
            <th aria-label="favorite" className="fav-col" />
            {COLUMNS.map((c) => {
              const active = sort === c.key;
              const arrow = active ? (dir === 'asc' ? '▲' : '▼') : '';
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button className="th-btn" onClick={() => onSortChange(c.key)}>
                    <span>{c.label}</span>
                    <span className="sort-arrow">{arrow}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr
              key={p.player_id}
              tabIndex={0}
              onClick={() => onRowClick(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(p);
                }
              }}
            >
              <td className="fav-col" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`fav-btn ${isFavorite(p.player_id) ? 'on' : ''}`}
                  aria-pressed={isFavorite(p.player_id)}
                  aria-label={isFavorite(p.player_id) ? 'Unfavorite' : 'Favorite'}
                  onClick={() => onToggleFavorite(p.player_id)}
                >
                  {isFavorite(p.player_id) ? '★' : '☆'}
                </button>
              </td>
              <td>{p.first_name ?? '—'}</td>
              <td>{p.last_name ?? '—'}</td>
              <td>{p.position ?? '—'}</td>
              <td>
                {p.status ? <span className={`pill pill-${slug(p.status)}`}>{p.status}</span> : '—'}
              </td>
              <td>{p.team ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
