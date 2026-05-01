import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { deriveFacets, getPlayers } from './players-cache';
import { applyQuery, buildResponse, normalizeQuery } from './players-query';
import type { PlayerDetailResponse } from '@shared/types';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: 'Too many requests, please try again later.',
});
app.use('/api/', limiter);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/players', async (req: Request, res: Response) => {
  try {
    const cache = await getPlayers();
    const q = normalizeQuery(req.query as Record<string, unknown>);

    // Default: hide retired / non-fantasy entries. The Sleeper feed is a
    // daily-cached lookup table that includes a lot of historical noise; for
    // this UI we want a clean roster-style list. `includeInactive=true` brings
    // the full set back in, including team-defense entries without
    // fantasy_positions.
    const dataset = q.includeInactive ? cache.allPlayers : cache.usablePlayers;
    const facets = q.includeInactive ? deriveFacets(dataset) : cache.facets;

    const { players, total, totalPages } = applyQuery(dataset, q);
    const body = buildResponse(players, total, totalPages, q, cache.cachedAt, facets, {
      rawCount: cache.allPlayers.length,
      usableCount: cache.usablePlayers.length,
      includedInactive: q.includeInactive,
    });
    res.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GET /api/players failed:', message);
    res.status(502).json({
      error: 'upstream_error',
      message: `Failed to load players from Sleeper: ${message}`,
    });
  }
});

// Single-player lookup looks across the entire cached set so detail panels
// still work for inactive / historical players linked from elsewhere.
app.get('/api/players/:id', async (req: Request, res: Response) => {
  try {
    const cache = await getPlayers();
    const player = cache.allPlayers.find((p) => p.player_id === req.params.id);
    if (!player) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ player, cachedAt: cache.cachedAt.toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'upstream_error', message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
