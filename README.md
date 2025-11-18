# Fence and Decking Planner

This repo contains a combined Express + Vite setup for the fence and decking planner web app. Follow the steps below to run it locally.

## Prerequisites
- Node.js 18 or newer
- npm 9+

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

## Production build
Build the client and bundle the server, then start the compiled server output:
```bash
npm run build
npm start
```

## Notes
- All client files live under `client/` with `src/main.tsx` as the entry point.
- API routes are registered in `server/routes/` via `server/index.ts`.
