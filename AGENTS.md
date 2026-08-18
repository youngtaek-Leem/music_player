# AGENTS.md - iCloud Music Player

## Project Overview
PWA that plays music from iCloud Drive via File System Access API. Pure static site (no backend), deployed to GitHub Pages. Uses IndexedDB for library index + playback state, HTML5 Audio API for playback, Workbox SW for offline caching.

## Commands
```bash
npm run dev       # Dev server (port 3000, host: true)
npm run build     # tsc -b && vite build → dist/
npm run preview   # Preview dist/
npm run lint      # oxlint
npm run typecheck # tsc --noEmit
```

## Architecture Notes (Non-Obvious)
- **Two folder-picking paths**: `showDirectoryPicker()` (modern) + `<input webkitdirectory>` fallback (iOS Safari < 15.2). Fallback stores `File` objects in memory only — not in IndexedDB.
- **File handles expire on browser close**: User must re-pick folder on revisit. Fallback playlists have `isFallback: true` flag.
- **Audio seeking requires Range Requests**: GitHub Pages supports this; local `file://` does not.
- **Cover art = Blob URLs**: Created via `URL.createObjectURL()` from metadata pictures. Must revoke on track delete to avoid leaks.
- **5s position autosave**: `AudioPlayer` saves playback state to IndexedDB every 5s via `setInterval`.

## Key Files
```
src/
├── types.ts       # Track, Playlist, PlaybackState, RepeatMode, events
├── library.ts     # Folder scan, metadata parsing (music-metadata), IndexedDB CRUD
├── player.ts      # AudioPlayer class (shuffle/repeat/resume logic)
├── App.tsx        # Main UI (React 19, event subscription pattern)
├── App.css        # Mobile-first, CSS custom properties
└── main.tsx       # Entry point
```

## TypeScript Config
- Project references: `tsconfig.app.json` (src) + `tsconfig.node.json` (vite.config.ts)
- Strict: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- Target: ES2023, bundler module resolution, React JSX transform

## Build/Deploy
- `vite.config.ts`: base `/music_player/`, PWA via `vite-plugin-pwa` (Workbox), manual chunks for vendor/music
- GitHub Actions: push to main → build → upload `dist/` → deploy to `gh-pages` branch
- Service Worker: `CacheFirst` for GitHub Pages assets, `autoUpdate` registration

## Critical Gotchas
1. **iOS Safari requires HTTPS** — GitHub Pages provides this; `npm run dev` on localhost won't work for File System Access API
2. **Permission resets on browser close** — `showDirectoryPicker` permission is session-only
3. **Large library scanning** — Recursive scan counts files first, then processes with progress events. 1000+ tracks = memory pressure
4. **music-metadata needs ArrayBuffer** — `file.arrayBuffer()` loads entire file; large FLAC/WAV can OOM
5. **Fallback mode (webkitdirectory)** — Files stored in memory only; page reload loses them. User must re-pick.

## Testing Checklist
- Mobile: iOS Safari File System Access API behavior
- Offline: Register SW, disable network, verify playback
- Large folder: 1000+ tracks scan performance/memory
- Cover art: Blob URL cleanup on delete

## Dependencies
- `react` ^19.2.8, `react-dom` ^19.2.8
- `idb` ^8.0.3 (IndexedDB wrapper)
- `music-metadata` ^11.14.0 (audio metadata parsing)
- `vite` ^8.2.0, `@vitejs/plugin-react` ^6.0.4
- `vite-plugin-pwa` ^1.3.0, `workbox-window` ^7.4.1
- `oxlint` ^1.75.0, `typescript` ~6.0.2

## Future Work (from code comments)
- [ ] LRC lyric parsing
- [ ] Web Audio API equalizer
- [ ] Theme customization
- [ ] Playlist import/export