import { useEffect } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { Player } from '@shared/types';

interface Props {
  player: Player | null;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}

function formatHeight(inches: string | number | null | undefined): string {
  if (!inches) return '—';
  const num = typeof inches === 'string' ? parseInt(inches, 10) : inches;
  if (isNaN(num)) return '—';
  const feet = Math.floor(num / 12);
  const remainingInches = num % 12;
  return `${feet}'${remainingInches}"`;
}

export default function PlayerDetailModal({
  player,
  onClose,
  isFavorite,
  onToggleFavorite,
}: Props) {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [player, onClose]);

  if (!player) return null;

  const display =
    player.full_name ||
    `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() ||
    player.player_id;

  // Surface a friendly summary up top, then dump the full record so the user
  // can inspect every field the API returns.
  const summaryRows: Array<[string, string]> = [
    ['Position', player.position ?? '—'],
    ['Team', player.team ?? '—'],
    ['Status', player.status ?? '—'],
    ['Age', player.age != null ? String(player.age) : '—'],
    ['Height', formatHeight(player.height)],
    ['Weight', player.weight != null ? `${player.weight} lbs` : '—'],
    ['Years Exp', player.years_exp != null ? String(player.years_exp) : '—'],
    ['College', player.college ?? '—'],
    ['Jersey #', player.jersey_number != null ? String(player.jersey_number) : '—'],
    ['Injury', player.injury_status ?? '—'],
  ];

  const fullEntries = Object.entries(player).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${display}`}
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>{display}</h2>
          </div>
          <div className="modal-actions">
            <Button
              variant={isFavorite ? 'contained' : 'outlined'}
              color="warning"
              startIcon={isFavorite ? <StarIcon /> : <StarBorderIcon />}
              aria-pressed={isFavorite}
              onClick={() => onToggleFavorite(player.player_id)}
              title={isFavorite ? 'Remove favorite' : 'Add favorite'}
            >
              {isFavorite ? 'Favorited' : 'Favorite'}
            </Button>
            <IconButton onClick={onClose} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </div>
        </header>

        <section>
          <h3>Summary</h3>
          <dl className="summary">
            {summaryRows.map(([k, v]) => (
              <div key={k} className="summary-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3>All metadata</h3>
          <div className="meta-table">
            {fullEntries.map(([k, v]) => (
              <div key={k} className="meta-row">
                <span className="meta-key">{k}</span>
                <span className="meta-val">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
