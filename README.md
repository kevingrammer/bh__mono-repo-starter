# NFL Players — Sleeper Browser

A full-stack TypeScript app that surfaces the NFL roster from the
[Sleeper API](https://api.sleeper.app/v1/players/nfl) with searchable, sortable,
filterable, paginated views, a player detail modal, and per-user favorites.
Built with Yarn workspaces, Express, and Next.js.

## Workspaces

| Package | Purpose |
| --- | --- |
| `packages/shared` | `Player`, `PlayerSummary`, `PlayersResponse`, and query types shared by both ends |
| `packages/server` | Express API — caches the Sleeper feed in memory, does all filtering/sorting/paginating server-side |
| `packages/client` | Next.js (pages router) UI — table, typeahead filters, detail modal, favorites, light/dark mode |

## Features

- **Sortable table** — click any column header (First name, Last name, Position, Status, Team)
- **Global search** — debounced 300 ms, searches name / team / position
- **Typeahead filters** — MUI Autocomplete for Position and Team; Select for Status
- **"Include inactive / historical"** toggle — hides retired players by default
- **Detail modal** — click any row to fetch the full player record; Escape or backdrop click to dismiss
- **Favorites** — star icon on each row; "Favorites only" toggle; persisted in `localStorage`
- **Light / dark mode** — toggle in the top-right corner; preference saved to `localStorage`; respects `prefers-color-scheme` on first visit
- **Loading skeleton** and **error state with retry**

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

Response shape:

```jsonc
{
  "players": [/* PlayerSummary[] — 15 fields, not the full record */],
  "total": 1234,
  "page": 1,
  "limit": 25,
  "totalPages": 50,
  "cachedAt": "2026-05-01T13:30:00.000Z",
  "facets": { "positions": [...], "teams": [...], "statuses": [...] },
  "source": { "rawCount": 11432, "usableCount": 2174, "includedInactive": false }
}
```

List responses use the lighter `PlayerSummary` type (15 fields). The detail
endpoint (`/api/players/:id`) returns the full `Player` record. This split
keeps list payloads small while giving the modal everything it needs.

The `facets` object powers the client's filter dropdowns — no second request
needed. `source` lets the UI show "X usable of Y in feed".

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

**MUI component library.**
MUI provided Autocomplete (typeahead with keyboard nav), TableSortLabel,
Pagination, IconButton, and accessible focus management out of the box. These
would have taken hours to build correctly from scratch and would have been
harder to make accessible by default.
*Alternative:* hand-written HTML + CSS. Lower bundle size (~200 KB saved) but
significantly more dev time and worse accessibility.

**Single shared theme context for light/dark mode.**
`useThemeMode` runs once in `_app.tsx` and is consumed via React context. This
ensures MUI's `ThemeProvider` and the CSS `data-theme` attribute stay in sync.
Running the hook in two places caused the `CssBaseline` background to stay
white in dark mode until the shared context approach was used.

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

## What I'd do with one more hour

This is what AI would have me do:
- **URL state.** Push filter/sort/page into the query string so the page is
  bookmarkable and browser back/forward works as expected.
- **Server-side `ETag` / `Cache-Control`.** The list response is deterministic
  for a given cache + query; an ETag lets the browser skip parsing unchanged
  responses entirely.
- **Integration tests.** `supertest` against the live Express router with the
  cache stubbed — covers the HTTP layer the unit tests miss.
- **Stable skeleton rows.** The loading skeleton uses fixed-height rows; ideally
  they'd match the actual column widths to avoid layout shift on load.
- **Virtualized table.** At 2,000+ rows with `includeInactive=true` the DOM
  gets heavy. `@tanstack/react-virtual` would fix this.
- **Better empty state.** Currently just "No players match these filters." — it
  should identify which filter is responsible and offer a one-click clear.

This is probably what I would really do:
- fix tests. Review their value manually
- look at the ui and use it to see where I could get any extra value and impact for the client in the time remaining, and make those changes. Maybe take 5 before doing so.


## How I used (and didn't use) AI

**Used AI (GitHub Copilot / Claude) for:**

- Scaffolding boilerplate: the Express handler skeleton, `useDebounced`,
  `useFavorites`, and the initial CSS layout, so time could go to logic and
  edge cases rather than plumbing.
- Drafting the initial unit tests, then revising to cover null-sort-last
  behavior and in-flight deduplication edge cases.
- MUI component syntax lookups (slot props, `sx` prop patterns, Autocomplete
  controlled-value wiring).
- Implementing the backoff schedule and stale-on-failure logic, after deciding
  the strategy myself.
- Verifying the Sleeper response shape and quirks. Field names, null handling,
  and the team-defense filtering were checked.

**Did not use AI for:**

- Decisions about what goes server-side vs client-side, cache TTL, the
  `PlayerSummary` / `Player` type split, or the shape of the API response.
  These are the tradeoffs a reviewer will ask about and I wanted to own them.
- The overall architecture and data flow.

**Where I caught AI being wrong and overrode it:**

- Suggested storing favorites in a server-side JSON file "for cross-device
  support." Without per-user identity that's a single shared list — rejected.
- Defaulted to client-side filtering in an early draft, which directly
  contradicts the spec.
- Proposed a two-instance `useThemeMode` approach that caused `CssBaseline` to
  override the dark background. Fixed by moving to a single shared context.

**Minor UI changes and fixing it's failures on light/dark mode:**
- It was struggling to get the dark mode toggle working correctly across the MUI theme and CSS variables, so I updated some of the variables and values to make it make sense.
- Made small manual changes to display

## Project layout

```
packages/
  shared/src/types.ts          # Player, PlayerSummary, PlayersResponse
  server/src/
    index.ts                   # Express app + routes + rate limiting
    players-cache.ts           # In-memory cache, normalization, backoff
    players-query.ts           # Pure filter / sort / paginate
    players-query.test.ts      # node:test unit tests
  client/src/
    pages/
      _app.tsx                 # ThemeProvider (single shared instance)
      index.tsx                # Main page — state, data fetching, filters
    components/
      PlayersTable.tsx         # Sortable table with favorites
      PlayerDetailModal.tsx    # Full player detail modal
    lib/
      api.ts                   # fetchPlayers + fetchPlayerDetail
      useDebounced.ts
      useFavorites.ts
      useTheme.ts              # Theme mode hook + MUI theme factory
      ThemeContext.tsx         # Shared theme context + AppThemeProvider
    styles/globals.css         # CSS variables (light + dark), layout
```
