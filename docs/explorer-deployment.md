# Explorer Deployment

The Co-located Spot Explorer frontend is published to Vercel as a static site.

## Build

```bash
npm run build
```

This produces `dist/index.html` and its assets via the single-entry Vite build
(`vite.config.js`). The Explorer is the root page.

## Vercel Configuration

The `vercel.json` at project root configures:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Set **Root Directory = `frontend`** in the Vercel project settings so the build
runs there. The Explorer is reachable at `/` on the deployed domain.

## Local-Backend Limitation

The static Vercel deployment is a **cosmetic copy only**. All API calls
(`/api/datasets`, `/api/jobs`, etc.) require the FastAPI backend, which runs
locally:

```bash
npm run dev:all   # starts both Vite dev server and FastAPI
```

The public Vercel link cannot reach a `localhost` backend (mixed content /
CORS), so:

- The Explorer will load and render the UI
- City dropdown will be empty; mining cannot run
- This is a documented, accepted limitation — not a bug

For a working end-to-end demo, run the app locally with `npm run dev:all` and
open `http://localhost:5173/`, or use the single-process production/Docker run
(see the README) where the backend serves the built app on one port.
