import type { PlayerSummary, SortDir, SortField } from '@shared/types';
import IconButton from '@mui/material/IconButton';
import TableSortLabel from '@mui/material/TableSortLabel';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';

interface Props {
  players: PlayerSummary[];
  sort: SortField;
  dir: SortDir;
  onSortChange: (field: SortField) => void;
  onRowClick: (playerId: string) => void;
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
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <TableSortLabel
                    active={active}
                    direction={active ? dir : 'asc'}
                    onClick={() => onSortChange(c.key)}
                  >
                    {c.label}
                  </TableSortLabel>
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
              onClick={() => onRowClick(p.player_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(p.player_id);
                }
              }}
            >
              <td className="fav-col" onClick={(e) => e.stopPropagation()}>
                <IconButton
                  size="small"
                  aria-pressed={isFavorite(p.player_id)}
                  aria-label={isFavorite(p.player_id) ? 'Unfavorite' : 'Favorite'}
                  onClick={() => onToggleFavorite(p.player_id)}
                  color={isFavorite(p.player_id) ? 'warning' : 'default'}
                >
                  {isFavorite(p.player_id) ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                </IconButton>
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
