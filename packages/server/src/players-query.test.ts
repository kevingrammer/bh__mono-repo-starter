import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import type { Player } from '@shared/types';
import { applyQuery, normalizeQuery } from './players-query';
import { isUsable, normalizePlayers } from './players-cache';

interface MkOpts {
  active?: boolean | null;
  fantasyPositions?: string[] | null;
}

function mk(
  id: string,
  first: string,
  last: string,
  position: string | null,
  team: string | null,
  status: string | null,
  opts: MkOpts = {},
): Player {
  // Use `in` so passing `active: null` or `fantasyPositions: null` is preserved
  // verbatim instead of falling back to the truthy default.
  const active = 'active' in opts ? opts.active! : true;
  const fantasy_positions =
    'fantasyPositions' in opts ? opts.fantasyPositions! : position ? [position] : null;
  return {
    player_id: id,
    first_name: first || null,
    last_name: last || null,
    full_name: first && last ? `${first} ${last}` : null,
    position,
    team,
    status,
    active,
    fantasy_positions,
  };
}

const fixture: Player[] = [
  mk('1', 'Patrick', 'Mahomes', 'QB', 'KC', 'Active'),
  mk('2', 'Travis', 'Kelce', 'TE', 'KC', 'Active'),
  mk('3', 'Justin', 'Jefferson', 'WR', 'MIN', 'Active'),
  mk('4', 'Aaron', 'Rodgers', 'QB', 'NYJ', 'Injured Reserve'),
  mk('5', 'Tom', 'Brady', 'QB', null, 'Inactive', { active: false }),
  mk('6', 'Christian', 'McCaffrey', 'RB', 'SF', 'Active'),
  mk('7', '', '', null, null, null, { active: false, fantasyPositions: null }),
];

describe('normalizeQuery', () => {
  test('applies sane defaults', () => {
    const q = normalizeQuery({});
    assert.equal(q.page, 1);
    assert.equal(q.limit, 25);
    assert.equal(q.sort, 'last_name');
    assert.equal(q.dir, 'asc');
    assert.equal(q.q, '');
    assert.equal(q.position, null);
    assert.equal(q.favoritesOnly, false);
    assert.equal(q.includeInactive, false);
  });

  test('clamps and parses page/limit', () => {
    const q = normalizeQuery({ page: '0', limit: '9999' });
    assert.equal(q.page, 1);
    assert.equal(q.limit, 200); // capped at MAX_LIMIT
  });

  test('rejects unknown sort field', () => {
    const q = normalizeQuery({ sort: 'bogus' });
    assert.equal(q.sort, 'last_name');
  });

  test("treats 'all' as no filter", () => {
    const q = normalizeQuery({ position: 'all', team: '   ' });
    assert.equal(q.position, null);
    assert.equal(q.team, null);
  });

  test('parses favorites flags', () => {
    const q = normalizeQuery({ favoritesOnly: 'true', favoriteIds: '1,2, 3' });
    assert.equal(q.favoritesOnly, true);
    assert.deepEqual(Array.from(q.favoriteIds).sort(), ['1', '2', '3']);
  });

  test('parses includeInactive flag', () => {
    assert.equal(normalizeQuery({ includeInactive: 'true' }).includeInactive, true);
    assert.equal(normalizeQuery({ includeInactive: '1' }).includeInactive, true);
    assert.equal(normalizeQuery({ includeInactive: 'false' }).includeInactive, false);
    assert.equal(normalizeQuery({}).includeInactive, false);
  });
});

describe('applyQuery — filtering', () => {
  test('filters by position', () => {
    const out = applyQuery(fixture, normalizeQuery({ position: 'QB' }));
    assert.equal(out.total, 3);
    assert.deepEqual(
      out.players.map((p) => p.last_name).sort(),
      ['Brady', 'Mahomes', 'Rodgers'],
    );
  });

  test('filters by team and status simultaneously', () => {
    const out = applyQuery(fixture, normalizeQuery({ team: 'KC', status: 'Active' }));
    assert.equal(out.total, 2);
  });

  test('search matches first/last/full name case-insensitively', () => {
    const out = applyQuery(fixture, normalizeQuery({ q: 'mahome' }));
    assert.equal(out.total, 1);
    assert.equal(out.players[0]!.last_name, 'Mahomes');
  });

  test('search also matches team code', () => {
    const out = applyQuery(fixture, normalizeQuery({ q: 'sf' }));
    assert.equal(out.total, 1);
    assert.equal(out.players[0]!.last_name, 'McCaffrey');
  });

  test('favoritesOnly + favoriteIds restricts results', () => {
    const out = applyQuery(
      fixture,
      normalizeQuery({ favoritesOnly: 'true', favoriteIds: '1,3' }),
    );
    assert.equal(out.total, 2);
    assert.deepEqual(
      out.players.map((p) => p.player_id).sort(),
      ['1', '3'],
    );
  });
});

describe('applyQuery — sorting', () => {
  test('sorts by last_name asc and pushes nulls to the end', () => {
    const out = applyQuery(fixture, normalizeQuery({ sort: 'last_name', dir: 'asc' }));
    const names = out.players.map((p) => p.last_name);
    assert.deepEqual(names, ['Brady', 'Jefferson', 'Kelce', 'Mahomes', 'McCaffrey', 'Rodgers', null]);
  });

  test('sorts desc, still keeping nulls last', () => {
    const out = applyQuery(fixture, normalizeQuery({ sort: 'last_name', dir: 'desc' }));
    const names = out.players.map((p) => p.last_name);
    assert.deepEqual(names, ['Rodgers', 'McCaffrey', 'Mahomes', 'Kelce', 'Jefferson', 'Brady', null]);
  });

  test('sorts by team', () => {
    const out = applyQuery(fixture, normalizeQuery({ sort: 'team', dir: 'asc' }));
    const teams = out.players.map((p) => p.team);
    // KC, KC, MIN, NYJ, SF, then nulls
    assert.deepEqual(teams.slice(0, 5), ['KC', 'KC', 'MIN', 'NYJ', 'SF']);
    assert.equal(teams[5], null);
    assert.equal(teams[6], null);
  });
});

describe('applyQuery — pagination', () => {
  test('respects page and limit', () => {
    const out = applyQuery(fixture, normalizeQuery({ limit: '2', page: '2', sort: 'last_name' }));
    assert.equal(out.total, 7);
    assert.equal(out.totalPages, 4);
    assert.equal(out.players.length, 2);
    assert.deepEqual(out.players.map((p) => p.last_name), ['Kelce', 'Mahomes']);
  });

  test('returns empty page when out of range', () => {
    const out = applyQuery(fixture, normalizeQuery({ limit: '2', page: '50' }));
    assert.equal(out.players.length, 0);
    assert.equal(out.total, 7);
  });
});

describe('Sleeper quirk filter (isUsable / normalizePlayers)', () => {
  test('isUsable requires active + position + non-empty fantasy_positions', () => {
    assert.equal(
      isUsable(mk('a', 'A', 'Active', 'WR', 'NE', 'Active')),
      true,
    );
    // not active
    assert.equal(
      isUsable(mk('b', 'B', 'Retired', 'WR', null, 'Inactive', { active: false })),
      false,
    );
    // active=null (Sleeper sometimes omits or sets it)
    assert.equal(
      isUsable(mk('c', 'C', 'Unknown', 'WR', 'NE', 'Active', { active: null })),
      false,
    );
    // no position
    assert.equal(
      isUsable(mk('d', 'D', 'Nopos', null, 'NE', 'Active')),
      false,
    );
    // empty fantasy_positions
    assert.equal(
      isUsable(mk('e', 'E', 'Empty', 'DEF', 'NE', 'Active', { fantasyPositions: [] })),
      false,
    );
  });

  test('normalizePlayers handles strings, empty strings, and the team-defense id case', () => {
    const raw = {
      // numeric-looking string id
      '1042': {
        first_name: 'Active',
        last_name: 'Guy',
        position: 'QB',
        team: 'NE',
        status: 'Active',
        active: true,
        fantasy_positions: ['QB'],
        weight: '220', // stringified number — should pass through unchanged
        sportradar_id: '', // empty string preserved on the raw blob, but
      },
      // team-defense id (non-numeric)
      CAR: {
        first_name: null,
        last_name: 'Panthers',
        position: 'DEF',
        team: 'CAR',
        status: 'Active',
        active: true,
        fantasy_positions: ['DEF'],
      },
      // junk: empty fantasy_positions, blank position
      junk1: {
        first_name: '',
        last_name: '',
        position: '',
        team: '',
        status: '',
        active: false,
        fantasy_positions: [],
      },
      // not even an object — should be skipped
      bogus: null,
    } as unknown as Record<string, Record<string, unknown>>;

    const players = normalizePlayers(raw);
    assert.equal(players.length, 3);

    const byId = Object.fromEntries(players.map((p) => [p.player_id, p]));

    // string ids preserved verbatim, even non-numeric ones
    assert.ok(byId['1042']);
    assert.ok(byId['CAR']);
    assert.equal(typeof byId['1042']!.player_id, 'string');

    // empty strings collapsed to null on the surfaced display fields
    assert.equal(byId['junk1']!.first_name, null);
    assert.equal(byId['junk1']!.position, null);
    assert.equal(byId['junk1']!.team, null);

    // active normalized to a boolean (or null), not the raw value
    assert.equal(byId['1042']!.active, true);
    assert.equal(byId['junk1']!.active, false);

    // fantasy_positions: real arrays kept, empty arrays collapsed to null
    assert.deepEqual(byId['1042']!.fantasy_positions, ['QB']);
    assert.equal(byId['junk1']!.fantasy_positions, null);

    // raw extras (like weight: "220") flow through untouched
    assert.equal(byId['1042']!.weight, '220');

    // isUsable picks up only the real ones
    const usable = players.filter(isUsable);
    assert.deepEqual(
      usable.map((p) => p.player_id).sort(),
      ['1042', 'CAR'],
    );
  });
});
