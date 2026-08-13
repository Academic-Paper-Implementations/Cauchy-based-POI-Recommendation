# Frontend Review — Co-location Pattern Explorer

Date: 2026-08-12 · Branch: `master` · Scope: `src/`, `index.html`, `vite.config.js`, `package.json`

Evidence: `npm run lint` clean; `npm run build` OK (see bundle numbers below); backend contracts
read from `server/main.py`, `server/pattern_query.py`, `server/engine/`.

## Verdict

Architecture is sound. Data flow is one-way, the Leaflet layer is driven imperatively for good
reason, the rare-threshold split (re-label vs re-mine) is the right call, and the comments explain
*why* rather than *what*. Problems are concentrated in three places: **layout below `lg`**,
**interaction cost of the two sliders / the Plotly path**, and **missing failure boundaries**.

Severity legend: P0 = broken for a real user, P1 = degrades the core task, P2 = hygiene.

---

## P0-1 · Map collapses to ~0 height below the `lg` breakpoint

`src/App.jsx:237-274`

```
<main className="grid min-h-0 flex-1 grid-cols-12 gap-4 p-4">
  <section className="col-span-12 min-h-0 lg:col-span-5">
    <div className="card h-full overflow-hidden p-1">
```

Below `lg` all three panels are `col-span-12`, so they stack into implicit **auto-sized** grid rows.
`h-full` on the card resolves against an auto row, the map `div` (`mining-map.jsx:128`) is
`h-full w-full` inside that, and the chain bottoms out at height 0. Leaflet then initialises into a
0-px container. Net result on tablet/phone: the map is invisible and `main` overflows `h-screen`
with no scroll container on the path.

**Fix.** Give the map an intrinsic height instead of inheriting one, and let the page scroll below
`lg`:

```jsx
<main className="grid flex-1 grid-cols-12 gap-4 overflow-auto p-4 lg:min-h-0 lg:overflow-hidden">
  <section className="col-span-12 h-[60vh] min-h-[360px] lg:col-span-5 lg:h-auto lg:min-h-0">
```

Same treatment for the two `aside` columns (`min-h-[320px]` below `lg`).

## P0-2 · Focus indicators removed and never replaced

`src/index.css:74-79, 89-94`

```css
.input-field:focus { outline: none; ring: 2px; ring-color: var(--color-primary-500); }
```

`ring` / `ring-color` are Tailwind **utility names**, not CSS properties. Inside `@layer components`
they are inert declarations the browser drops. `outline: none` is the only thing that applies, so
every `input-field` and `select-field` in the app has *no* visible focus state — keyboard navigation
is unusable and this fails WCAG 2.4.7.

**Fix.** Use the real property:

```css
.input-field:focus-visible,
.select-field:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
  border-color: transparent;
}
```

## P0-3 · A transient poll failure permanently hides job progress

`src/App.jsx:94-108` + `src/components/job-progress.jsx:23-27`

The poll's `catch` calls `setJobError`, and `JobProgress` returns the error card **instead of** the
job — `if (error) return <error card>` short-circuits before any status rendering. One dropped
request during a 20-minute run replaces the stage list with a red box for the rest of the run;
nothing clears `jobError` except starting a new job. The same state is also written by dataset-load
failures at mount (`App.jsx:57`), so an unrelated error appears in the job panel.

**Fix.** Separate the two channels and make poll errors transient:
- keep `jobError` for run-submission failures only; add a top-level `appError` banner for
  dataset/instances loads;
- in the poll, tolerate N consecutive failures before surfacing anything, and render the error
  *alongside* the stage list rather than replacing it;
- clear the error on the next successful tick.

---

## P1-1 · Rare-threshold slider fires a request per drag step

`src/App.jsx:139-148`, `src/components/pattern-list.jsx:92-100`

`onChange` on `<input type="range" step="5">` fires on every step. Dragging 0→100 issues **20**
`/result` requests, each returning the full pattern list, plus 20 `/instances/…` detail requests when
a point is selected. Responses can land out of order, so the table can settle on a stale threshold.

**Fix.** Debounce ~200 ms and drop stale responses:

```js
const reqId = useRef(0);
const changeRarePercentile = (value) => {
  setRarePercentile(value);                 // slider stays responsive
  const id = ++reqId.current;
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(async () => {
    if (!job || job.status !== 'done') return;
    const body = await api.result(job.job_id, { rarePercentile: value, rareMinCount: RARE_MIN_COUNT });
    if (id === reqId.current) setResult(body);   // ignore superseded responses
  }, 200);
};
```

Add an `AbortController` per request while you are there — `config/api.js:8` never passes `signal`.

## P1-2 · Plotly path re-plots 17k points on every selection

`src/components/SpatialMap.jsx:19-71` — bundle: **4,865 kB (1,478 kB gzip)**, vs 386 kB for
everything else.

The `traces` memo depends on `selected` and `neighbors`, so each click regroups all instances and
rebuilds every array, forcing `react-plotly.js` to re-plot. The Leaflet view solves the identical
problem correctly (`mining-map.jsx:82-101`: restyle in place, never rebuild). Toronto is 17,128
instances and has no lat/lon, so it always takes the slow path.

**Fix (cheap).** Split the memo so point traces depend only on `[instances, colors]`, and drive
highlight through `Plotly.restyle` on `marker.opacity` via a ref — or move the highlight into a
separate small trace layered on top, leaving the base traces untouched.

**Fix (structural, optional).** Replace Plotly with `deck.gl` `ScatterplotLayer` or plain canvas.
Plotly buys one scatter plot here at ~13× the cost of the rest of the app.

## P1-3 · No loading state while 10–17k instances download

`src/App.jsx:61-80`

Switching datasets clears everything and fires `api.instances()`. Until it resolves the map is blank
and the panels say "Run mining first" — indistinguishable from an empty dataset or a failure.
Philadelphia is 9,928 rows, Toronto 17,128.

**Fix.** Add `instancesLoading` state and render a skeleton/spinner in the map card. Consider
`Cache-Control` on the endpoint so re-selecting a dataset is instant.

## P1-4 · Clicking a row in the pattern table appears to do nothing

`src/App.jsx:197-201, 291-298`

`PatternList` rows set `selectedPatternIndex`, but `highlightedNeighbors` resolves that index
against `detail.patterns` — which only exists once an *instance* is selected. So with no instance
selected, a row highlights itself and produces no map change. The affordance (cursor-pointer, hover,
selected background) promises otherwise.

**Fix.** Pick one:
- (a) when a pattern row is clicked with no instance selected, dim the map to that pattern's
  participating instances — needs a `/result` payload carrying participant keys, or a new endpoint;
- (b) short of backend work, disable row selection until an instance is picked and show
  "Select a point on the map to locate this pattern" — honest and free.

---

## P2 · Hygiene

| # | Issue | Location | Note |
|---|---|---|---|
| 1 | No error boundary — any render throw blanks the app | `src/main.jsx` | Wrap `<App/>` in an error boundary with a reload affordance. |
| 2 | `pattern.wpi.toFixed(4)` guarded only by `deduced && wpi === null` | `pattern-list.jsx:30-42` | The engine's invariant (`miner.h:20-27`) never emits `wpi:null, deduced:false`, so this is not a live crash — but it is one stale cache file away from one. Guard on `wpi === null` alone. |
| 3 | No `htmlFor` / `id` on any label | `mining-controls.jsx`, `pattern-list.jsx:87`, `DataUpload.jsx:137` | Labels are associated with nothing; screen readers announce bare inputs. Add `id`+`htmlFor` (or wrap the control). |
| 4 | Table rows clickable but not keyboard reachable | `pattern-list.jsx:116-123` | Add `tabIndex={0}` + `onKeyDown` (Enter/Space) and `aria-selected`, or put a `<button>` in the first cell. |
| 5 | Pagination not reset when a new result arrives | `pattern-list.jsx:52,73-75` | `Math.min` clamps but the user silently lands mid-list. Reset on `result` change. |
| 6 | `new Set(rareFeatures)` rebuilt per row, per render | `pattern-list.jsx:12` | 50 rows × every render. Hoist to the parent and pass the Set down. |
| 7 | `App.jsx` holds 12 `useState` + 5 effects | `App.jsx:22-42` | Extract `useMiningJob(datasetId)` (job, poll, result, rare threshold) and `useInstanceDetail(job)`. Halves the component and makes the poll testable. |
| 8 | File naming inconsistent with the rest of `src/` | `DataUpload.jsx`, `SpatialMap.jsx` | Every other component is kebab-case. Rename to `data-upload.jsx`, `spatial-map.jsx`. |
| 9 | Build tooling in `dependencies` | `package.json:16,17,21,25` | `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `autoprefixer` are build-time only → move to `devDependencies`. |
| 10 | Dead code | `mining-map.jsx:30-38` (`center` memo, used once then eslint-disabled); `config/api.js:29,67` (`health`, `clearCache` unused) | Remove or wire up. |
| 11 | Zero frontend tests | `src/` | Backend has 6 pytest modules; frontend has none. |
| 12 | `map.setView` on every selection | `mining-map.jsx:125` | Deliberate and documented, but it re-centres on *every* click. Consider only recentring when the target is outside the current viewport. |

---

## Proposed sequencing

**Step 1 — correctness (small, no new deps).** P0-1 layout, P0-2 focus, P0-3 error channels,
P2-1 error boundary, P2-2 WPI guard. Roughly one sitting; unblocks mobile and keyboard users.

**Step 2 — interaction cost.** P1-1 debounce + abort, P1-3 loading state, P1-4 decide (a) or (b).
Highest felt improvement per line changed.

**Step 3 — Plotly.** P1-2 split the memo and restyle in place. Only if the Toronto dataset matters;
if it does not, consider dropping `react-plotly.js` entirely and rendering X/Y datasets on Leaflet
with `L.CRS.Simple`, which would delete ~4.8 MB and one whole component.

**Step 4 — structure.** P2-7 hook extraction, P2-8 renames, P2-9 dependency move, then add
Vitest + Testing Library covering the poll state machine, rare-threshold debounce, and the
`hasLatLon` branch.

Steps 1 and 2 are independent of 3 and 4 and can ship alone.

## Open questions

1. Is the Toronto (X/Y-only) dataset a real requirement, or a verification fixture? The answer
   decides whether Plotly stays at all (`server/datasets.py:154` labels it "verification fixture").
2. Is mobile/tablet a target? P0-1 must be fixed either way (the map is broken today), but the
   ambition of the small-screen layout depends on it.
3. Should P1-4 get backend support (participant keys in `/result`), or is the honest-disable route
   acceptable for now?
