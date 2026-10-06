# Soundboard (Obsidian plugin)

Canvas-style soundboard with looping sounds, scenes, fades and nested boards.
Build with `npm install && npm run build`. The plugin files (`main.js`, `manifest.json`,
`styles.css`) are written to `dist/`; copy that folder's contents into
`<vault>/.obsidian/plugins/soundboard/`. `npm run dev` rebuilds `dist/` on every change.

## Source map

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin entry: registers the view, commands, settings; keeps paths valid after renames |
| `src/types.ts` | Constants and data shapes (`Sound`, `Scene`, `BoardData`, `Settings`) |
| `src/utils.ts` | Small helpers (ids, labels, path remapping, name validation) |
| `src/board-model.ts` | Pure functions over board data (parsing, scene membership, rectangle queries) |
| `src/history.ts` | Undo/redo snapshots of a board's cards and scenes |
| `src/selection.ts` | The set of selected nodes |
| `src/layout.ts` | Grid placement of newly added cards, avoiding existing ones |
| `src/clipboard.ts` | Copy/paste of nodes (shared between boards) |
| `src/settings.ts` | Settings defaults and settings tab |
| `src/audio/audio-engine.ts` | One audio element per sound, volume, fades |
| `src/audio/board-playback.ts` | Cards and scenes to sounds, nested boards, one-scene-at-a-time, crossfades |
| `src/ui/soundboard-view.ts` | The view: owns board data, wires everything together |
| `src/ui/host.ts` | Interface the UI helpers use to talk to the view |
| `src/ui/camera.ts` | Pan/zoom and screen-to-board coordinates |
| `src/ui/node-layer.ts` | DOM for scenes and cards; syncs with playback and selection |
| `src/ui/interactions.ts` | Pan, box select, node dragging, keyboard shortcuts, file drops |
| `src/ui/node-actions.ts` | Copy, paste, delete, rename, select all |
| `src/ui/context-menus.ts` | Right-click menus |
| `src/ui/importer.ts` | Adding audio, folders, nested boards and scenes |
| `src/ui/dropped-files.ts` | Reading files and folders dropped from the operating system |
| `src/ui/toolbar.ts` | Floating toolbar |
| `src/ui/modals.ts` | File picker and rename dialog |
| `src/ui/drag.ts` | Shared pointer-drag helper |
