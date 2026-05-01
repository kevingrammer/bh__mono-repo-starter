# NFL Players — Sleeper Browser

A small full-stack TypeScript app that surfaces the NFL roster from the
[Sleeper API](https://api.sleeper.app/v1/players/nfl) with searchable, sortable,
filterable, paginated views, a detail modal, and per-user favorites.

Built against the `bh__mono-repo-starter` (Yarn workspaces, Express, Next.js).

## Workspaces

- **packages/shared** — `Player`, `PlayersResponse`, query types shared by both ends.
- **packages/server** — Express API. Caches Sleeper response in memory; does all filtering/sorting/paginating server-side.
- **packages/client** — Next.js (pages router) UI: table, filters, modal, favorites.

## Getting started

Prerequisites: Node 22 (the repo declares `engines.node = 22.x`) and Yarn 1.x.

```bash
yarn install
yarn dev          # runs server (3001) and client (3000) together
```

Or start them separately:

```bash
yarn workspace @server/api dev
yarn workspace @client/web dev
```

The client proxies `/api/*` to `http://localhost:3001` (configurable via
`NEXT_PUBLIC_API_BASE`) using a Next.js rewrite.

Open http://localhost:3000.

### Tests

```bash
yarn workspace @server/api test
```

This runs `tsx --test` over the unit tests in `packages/server/src/*.test.ts`.
The tests cover query normalization, filter, sort and pagination logic against
a small in-memory fixture.

### Type-check

```bash
yarn type-check
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/api/players` | List players (filter / sort / paginate) |
| `GET` | `/api/players/:id` | Single player record |

`/api/players` query parameters:

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | — | Free-text search across first/last/full name, team, position |
| `position` | string | — | Exact match (case-insensitive); send `all` or omit for no filter |
| `team` | string | — | Exact match |
| `status` | string | — | Exact match |
| `sort` | `last_name` \| `first_name` \| `position` \| `status` \| `team` | `last_name` | Anything else falls back to `last_name` |
| `dir` | `asc` \| `desc` | `asc` | |
| `page` | int ≥ 1 | `1` | |
| `limit` | int 1–200 | `25` | Capped server-side |
| `favoritesOnly` | `true`/`false` | `false` | Pre-filters before search/sort/paginate |
| `favoriteIds` | comma-separated ids | — | Required when `favoritesOnly=true` |
| `includeInactive` | `true`/`false` | `false` | Include retired / historical / non-fantasy entries (off by default) |

Response shape (`packages/shared/src/types.ts → PlayersResponse`):

```jsonc
{
  "players": [/* Player[] */],
  "total": 1234,
  "page": 1,
  "limit": 25,
  "totalPages": 50,
  "cachedAt": "2026-05-01T13:30:00.000Z",
  "facets": { "positions": [...], "teams": [...], "statuses": [...] },
  "source": { "rawCount": 11432, "usableCount": 2174, "includedInactive": false }
}
```

The `facets` object is derived from the active dataset and powers the client’s
filter dropdowns — no second request needed. `source` lets the UI show "X
usable of Y in feed" so it’s obvious that the default view hides historical
players.

## Sleeper API quirks the server handles

Treat the feed as a *daily-cached lookup table*, not a clean query API.

- **Top-level shape is an object, not an array.** Keys are `player_id`s. The
  cache normalizes this into an array on ingest.
- **Ids are strings, including non-numeric ones.** Team defenses are keyed by
  team code (e.g. `"CAR"`). Never parse ids as numbers; the lookup endpoint
  searches the full set so D/ST entries still resolve.
- **Lots of nullable / inconsistent fields.** Empty strings, missing keys,
  `weight: "220"` as a string, etc. The normalizer collapses empty strings to
  `null` on the surfaced fields and leaves the raw blob untouched on the
  rest, so the detail modal can still render every field.
- **Don't trust `team`, `status`, or depth-chart fields as source of truth.**
  We surface them as display metadata only.
- **Filter aggressively by default.** The feed includes retired, historical,
  free-agent and non-fantasy entries. The server pre-computes a "usable"
  subset on cache ingest:
  ```ts
  p.active === true && p.position && p.fantasy_positions?.length
  ```
  That subset is what `/api/players` returns by default. Pass
  `includeInactive=true` to query the full set instead. The response always
  reports both counts under `source.rawCount` / `source.usableCount` so the
  UI can show "2,174 usable of 11,432 in feed".
- **Cache aggressively.** 12-hour in-memory TTL plus an in-flight promise
  guard. We hit Sleeper at most once per process lifetime under normal use,
  well under the informal 1000 req/min limit.

## API caching strategy

The server caches the entire Sleeper players feed in memory for 12 hours.

```
Request
  → cache fresh?          → return cache (instant)
  → fetch already running? → wait on same Promise (dedup)
  → Sleeper up?           → fetch, normalize, store, reset backoff
  → Sleeper down?
      → stale cache exists? → return stale data, schedule retry with backoff
      → no cache at all?   → throw (caller gets 500)
```

**Why in-memory TTL:**
Sleeper recommends polling the feed at most once per day. The payload is ~5–10MB
and contains ~11k records. Fetching it per-request would be both wasteful and
likely to get the server rate-limited. A module-level variable is zero-infra and
the data changes infrequently enough that 12 hours is safe.

**In-flight deduplication:**
A single `Promise` is stored while a fetch is in progress. Any concurrent
request that arrives with a stale cache waits on the same `Promise` rather than
fanning out into multiple simultaneous Sleeper requests.

**Stale-on-failure:**
If a refresh fetch fails (Sleeper is down, network blip, etc.), the server
returns the last good cache entry rather than propagating a 500. A warning is
logged with the cache age. The error is only re-thrown if there is no stale
entry to fall back on (i.e., the very first fetch on a cold start fails).

**Exponential backoff:**
After a failed fetch, the server enforces a back-off window before attempting
another Sleeper request. Subsequent failures within the window return stale data
immediately without hitting Sleeper again. The schedule:

| Failure | Delay |
| --- | --- |
| 1st | 30 s |
| 2nd | 60 s |
| 3rd | 2 min |
| 4th | 4 min |
| 5th+ | 10 min (cap) |

Backoff resets to zero on the first successful fetch.

**Trade-offs / known gaps:**
- Cache is lost on server restart (cold-start penalty: one blocking Sleeper fetch).
- Not shared across multiple server instances. Add Redis if horizontally scaling.
- No ETag / `If-Modified-Since` toward Sleeper, so every refresh fetches the full payload.

## Major decisions and trade-offs

**In-memory cache with a 12 hour TTL, refreshed on demand.**
Sleeper recommends polling the players feed at most once per day, and the
payload is ~10MB. A simple module-level cache plus a single in-flight promise
guard means we hit Sleeper at most once per process lifetime under normal use,
and concurrent requests during a refresh share one fetch.
*Alternative considered:* persistent cache (Redis, on-disk file). Overkill for
a single-process demo and adds infra to set up; the in-memory store is the
right cost/benefit at this scope.

**Server-side filter / sort / paginate.**
The spec is explicit, and it’s the right call regardless: shipping the entire
feed to the client every search would be wasteful and would make the favorites
toggle awkward. The server returns just the visible page and the facets, so
the client stays cheap.
*Alternative:* fetch once, do everything client-side. Faster to wire up but
fights the spec and breaks the “responsive” requirement on slow phones.

**Pure functions in `players-query.ts`.**
The route handler is a thin wrapper around `normalizeQuery()` and
`applyQuery()` so the unit tests can exercise them without spinning up
Express. Easier to test, easier to reason about.

**Permissive `Player` type.**
Sleeper has lots of nullable / missing fields and team-defense entries keyed
by team code rather than numeric id. The shared type calls out the fields the
UI actually surfaces and keeps an index signature for the rest, so the modal
can render every metadata field without me hand-listing 40 of them.

**Favorites in `localStorage`.**
The spec said server-side or local; with no auth in scope, local is the
honest choice. The client sends the favorite ids alongside the request when
"favorites only" is on so the server still does the filtering.
*Alternative:* a JSON file on the server. Simpler to demo cross-device, but
without per-user identity it’s a single shared list, which is worse UX.

**Node’s built-in test runner instead of Jest/Vitest.**
No new dependencies, instant startup via `tsx --test`, and the spec only
asks for one unit test. Easier to keep dependencies minimal in a 2-hour
build. If we needed mocks/snapshots/coverage, I’d swap in Vitest.

**Next.js rewrites for `/api/*` proxy.**
Means the client always calls same-origin `/api/players`, so deploying behind
a single domain or running both behind one ngrok tunnel works without CORS
fiddling.

**Shared package points at `src/`.**
Easier to dev — no `tsc --watch` step needed. For a real release we'd build
shared first or publish it; at this size, the simpler dev loop wins.

**Styling: hand-written CSS, no UI library.**
Faster than configuring Tailwind in this starter, and a small component count
doesn't justify a design system. Status pills are color-coded by status to
keep the table scannable.

## Security

**Prototype pollution vulnerability (fixed).**
The original `normalizePlayers()` function used object spread syntax (`...record`)
to copy Sleeper response data into Player objects. If the Sleeper API ever
returned malicious keys like `__proto__` or `constructor`, they could pollute
the prototype chain. The fix explicitly picks only the 18 known fields by name
with proper type coercion, preventing any unknown keys from being written to
the object.

**CORS is wide open (`app.use(cors())`).**
Fine for local development, but before any real deployment this should be
locked to the client origin via `cors({ origin: process.env.ALLOWED_ORIGIN })`.

**Rate limiting (fixed).**
Added `express-rate-limit` middleware that caps each IP to 100 requests per 15 minutes
on `/api/*` routes. Returns 429 (Too Many Requests) if exceeded. Prevents basic
DDoS and accidental hammering.

**`favoriteIds` sent as URL query param (fixed).**
Capped at 500 favorites server-side in `normalizeQuery()` using `.slice(0, 500)`.
Any favorites beyond 500 are silently dropped. Client-side, all favorites are still
stored in `localStorage`; only the first 500 are sent to the server for filtering.
Prevents pathologically long URLs from causing issues.

## Things to ship in another hour

- **Stable list animations + skeleton rows that match the column widths.**
  Right now there’s a small flash on every refetch.
- **URL state.** Push filter/sort/page into the query string so the page is
  shareable and back/forward works as expected.
- **Server-side ETag / Cache-Control** so the client benefits from HTTP cache
  and we get conditional refetch for free when filters don’t change.
- **Full integration tests.** Use `supertest` to hit the live route with the
  cache stubbed out.
- **Stretch: group-by-team summary, infinite scroll, dark mode.** The CSS
  already uses CSS variables so a dark theme is mostly a `prefers-color-scheme`
  block.
- **Better empty state and "search inside a position".** Current search is
  permissive but doesn't tell the user how filters are combining.
- **Virtualize the table** if we ever paginate above a few hundred rows.

## How I used (and didn't use) AI

**Used Claude (Sonnet) for:**

- Stubbing out the boilerplate Express handler, the React hooks (`useDebounced`,
  `useFavorites`), and the CSS scaffold so I could spend my time on logic and
  edge cases instead of typing out plumbing.
- Drafting an initial set of unit tests, which I then revised to cover the
  null-sort-last behavior I actually wanted.

**Did not use AI for:**

- Decisions about caching strategy, what to put server-side vs client-side, and
  the shape of the API response — those are tradeoffs the reviewer will ask
  about and I want to own them.
- Verifying the Sleeper response shape and quirks. I sanity-checked field names
  and null handling against the actual JSON before locking in the types,
  rather than trusting the model’s recall.
- Writing the README. AI-written READMEs read like AI-written READMEs.

**Where I noticed AI being misleading and corrected it:**

- It initially suggested storing favorites in a JSON file on the server "for
  cross-device support". With no auth, that just means everyone shares one
  list — wrong call, and I rejected it.
- It defaulted to client-side filtering which directly contradicts the spec.
  Useful reminder to read the requirements myself before asking.

## Project layout

```
packages/
  shared/src/types.ts          # Player, PlayersQuery, PlayersResponse
  server/src/
    index.ts                   # Express app + routes
    players-cache.ts           # In-memory Sleeper cache + normalization
    players-query.ts           # Pure filter / sort / paginate
    players-query.test.ts      # node:test unit tests
  client/src/
    pages/index.tsx            # Main page (state + data fetching)
    components/
      PlayersTable.tsx
      PlayerDetailModal.tsx
    lib/
      api.ts                   # /api/players client
      useDebounced.ts
      useFavorites.ts
    styles/globals.css
```
