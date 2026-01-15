# Fence and Decking Planner

This repo contains a combined Express + Vite setup for the fence and decking planner web app. Follow the steps below to run it locally.

> **Where to run commands**
> Run all npm commands from the repository root (the folder that contains `package.json`). On Windows, a working sequence in PowerShell is:
> ```powershell
> cd C:\dev\FPR2
> dir package.json
> npm install
> npm run dev
> ```
> If `dir package.json` does not list the file, you are in the wrong folder—`cd` into the directory that shows `package.json` first.

## Prerequisites
- Node.js 22 LTS (preferred) or Node.js 20 LTS
- npm 9+

## Node version (required)
Verify your current version:
```bash
node -v
```

### Windows (nvm-windows)
Install and use Node 22 LTS:
```powershell
nvm install 22
nvm use 22
```

Clean install (PowerShell):
```powershell
taskkill /F /IM node.exe 2>nul
rmdir /s /q node_modules
del package-lock.json
npm cache clean --force
npm install
```

Run the app:
```powershell
npm run dev
```

### Windows (installer fallback)
If you do not use nvm-windows, download and install Node 22 LTS from https://nodejs.org/en/download. After installing, run the clean install steps above to refresh dependencies.

## Install dependencies
```bash
npm install
```

## Run in development
The Express server boots Vite in middleware mode and serves both API routes and the React client.
```bash
npm run dev
```
The app starts on `http://localhost:5000` (or the port set in `PORT`). Hot reloading is enabled by Vite.

## Vite prebundle cache reset (__publicField is not defined)
If you see `__publicField is not defined` or dependency updates are not being picked up, clear Vite's prebundle cache and force a re-optimization.

1) Stop the dev server.
2) Kill any stuck Node processes:
```powershell
taskkill /F /IM node.exe 2>$null
```
3) Delete Vite's prebundle caches from the repo root:
```powershell
Remove-Item -Recurse -Force .\node_modules\.vite 2>$null
Remove-Item -Recurse -Force .\client\node_modules\.vite 2>$null
```
4) If the error persists, do a full dependency reinstall:
```powershell
Remove-Item -Recurse -Force .\node_modules 2>$null
Remove-Item -Recurse -Force .\client\node_modules 2>$null
Remove-Item -Force .\package-lock.json 2>$null
npm cache clean --force
npm install
```
5) Restart Vite with a forced dependency re-optimization:
```powershell
npm run dev -- --force
```
6) In the browser, hard reload and clear site data for `http://localhost:5000`:
DevTools → Application → Storage → Clear site data, then `Ctrl + Shift + R`.

## Production build
Build the client and bundle the server, then start the compiled server output:
```bash
npm run build
npm start
```

## Database and authentication
Project accounts and saved projects are stored in a local SQLite database file.

### Environment variables
- `SQLITE_PATH`: Optional. File path for the SQLite database. Defaults to `data/app.db`.

### Migration / setup
The server initializes the SQLite tables on startup. Ensure the process has write access to the directory you set in `SQLITE_PATH`.

## Satellite imagery configuration
- `VITE_SATELLITE_PROVIDER`: Optional. Set to `nearmap`, `maptiler`, or `esri` to force a provider. When unset, the app tries Nearmap first (if available), then MapTiler, then Esri.
- `VITE_MAPTILER_API_KEY`: Optional. Client-side key for MapTiler satellite imagery.
- `NEARMAP_API_KEY`: Server-side Nearmap Tile API key used by the `/api/nearmap/tiles/...` proxy. This value is only read on the server.

Copy `.env.example` to `.env` in the **repository root** (the same folder as `package.json`) and fill in the values you need. Never commit real keys.

### Nearmap API key setup
Set `NEARMAP_API_KEY` in the server environment—**do not prefix it with `VITE_`** or the key will be bundled into the client build.

- **Local development (.env):** add `NEARMAP_API_KEY=your_real_key_here` to the backend environment file that the server loads (typically the project root `.env` used by `npm run dev`).
- **Hosted deployments:** add `NEARMAP_API_KEY` in your hosting provider's environment variable settings for the backend service (e.g., Render, Railway, Replit deployment). Make sure it is attached to the server process, not just the frontend build.
- After setting the variable, restart the backend so the process picks it up.
- Verify by reloading `/api/nearmap/health`. A configured server responds with `200 OK`; an unconfigured server returns `NEARMAP_API_KEY not configured`.

By default the server loads environment variables from `.env` in the repo root via `dotenv/config`. If you keep your secrets in a different path or filename, set `DOTENV_CONFIG_PATH` before running the server, for example:

```bash
DOTENV_CONFIG_PATH=server/.env.local npm run dev
```

### Nearmap API key setup
Set `NEARMAP_API_KEY` in the server environment—**do not prefix it with `VITE_`** or the key will be bundled into the client build.

- **Local development (.env):** add `NEARMAP_API_KEY=your_real_key_here` to the backend environment file that the server loads (typically the project root `.env` used by `npm run dev`).
- **Hosted deployments:** add `NEARMAP_API_KEY` in your hosting provider's environment variable settings for the backend service (e.g., Render, Railway, Replit deployment). Make sure it is attached to the server process, not just the frontend build.
- After setting the variable, restart the backend so the process picks it up.
- Verify by reloading `/api/nearmap/health`. A configured server responds with `200 OK`; an unconfigured server returns `NEARMAP_API_KEY not configured`.

## Notes
- All client files live under `client/` with `src/main.tsx` as the entry point.
- API routes are registered in `server/routes/` via `server/index.ts`.
