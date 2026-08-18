# Explorer Deployment

The Co-located Spot Explorer frontend is published to Vercel as a static site.

## Build

```bash
npm run build
```

This produces `dist/explorer.html` and associated assets via the multi-entry Vite
build (`vite.config.js`).

## Vercel Configuration

The `vercel.json` at project root configures:

- **Build command:** `npm run build`
- **Output directory:** `dist`

The Explorer is reachable at `/explorer.html` on the deployed domain.

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
access `http://localhost:5173/explorer.html`.
