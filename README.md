# Soundboard (Obsidian plugin)

Canvas-style soundboard with looping sounds, scenes, fades and nested boards.
Build with `npm install && npm run build`. The plugin files (`main.js`, `manifest.json`,
`styles.css`) are written to `dist/`; copy that folder's contents into
`<vault>/.obsidian/plugins/soundboard/`. `npm run dev` rebuilds `dist/` on every change.

## Source map

| File                          | Responsibility                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `src/main.ts`                 | Plugin entry: registers the view, commands, settings; keeps paths valid after renames |
| `src/types.ts`                | Constants and data shapes (`Sound`, `Scene`, `BoardData`, `Settings`)                 |
| `src/utils.ts`                | Small helpers (ids, labels, path remapping, name validation)                          |
| `src/board-model.ts`          | Pure functions over board data (parsing, scene membership, rectangle queries)         |
| `src/history.ts`              | Undo/redo snapshots of a board's cards and scenes                                     |
| `src/selection.ts`            | The set of selected nodes                                                             |
| `src/layout.ts`               | Grid placement of newly added cards, avoiding existing ones                           |
| `src/clipboard.ts`            | Copy/paste of nodes (shared between boards)                                           |
| `src/settings.ts`             | Settings defaults and settings tab                                                    |
| `src/audio/audio-engine.ts`   | One audio element per sound, volume, fades                                            |
| `src/audio/board-playback.ts` | Cards and scenes to sounds, nested boards, one-scene-at-a-time, crossfades            |
| `src/ui/soundboard-view.ts`   | The view: owns board data, wires everything together                                  |
| `src/ui/host.ts`              | Interface the UI helpers use to talk to the view                                      |
| `src/ui/camera.ts`            | Pan/zoom and screen-to-board coordinates                                              |
| `src/ui/node-layer.ts`        | DOM for scenes and cards; syncs with playback and selection                           |
| `src/ui/interactions.ts`      | Pan, box select, node dragging, keyboard shortcuts, file drops                        |
| `src/ui/node-actions.ts`      | Copy, paste, delete, rename, select all                                               |
| `src/ui/context-menus.ts`     | Right-click menus                                                                     |
| `src/ui/importer.ts`          | Adding audio, folders, nested boards and scenes                                       |
| `src/ui/dropped-files.ts`     | Reading files and folders dropped from the operating system                           |
| `src/ui/toolbar.ts`           | Floating toolbar                                                                      |
| `src/ui/modals.ts`            | File picker and rename dialog                                                         |
| `src/ui/drag.ts`              | Shared pointer-drag helper                                                            |

## Testing

```
npm test             # run all tests once
npm run test:watch   # re-run on change
npm run coverage     # tests + coverage report (text, html in coverage/, lcov)
npm run lint         # ESLint (typescript-eslint)
npm run format       # Prettier (format:check in CI)
npm run typecheck    # tsc over src and test
npm run ci           # everything CI runs: lint, format, typecheck, coverage, build
```

The `.github/workflows/ci.yml` workflow runs `npm run ci` steps on every push and pull request and
uploads `dist/` and the coverage report as artifacts. Coverage thresholds (statements 95%, branches 85%,
functions 92%, lines 95%) are set in `vitest.config.mts`; the build fails if coverage drops below them.

### How the tests are organised

| Layer        | Files                                                                                        | What they check                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure logic   | `utils`, `board-model`, `layout`, `history`, `selection`, `clipboard`, `dropped-files`       | Plain functions and classes, including property-based tests ([fast-check](https://fast-check.dev)) for the layout (new cards never overlap), undo history (undo all then redo all) and path remapping |
| Audio        | `audio-engine`, `board-playback`                                                             | Playback, fades (with fake timers), scenes, one-scene-at-a-time, crossfades, nested boards and cycles, renames, using a fake `Audio` element                                                          |
| Whole plugin | `view`, `context-menus`, `importer`, `renaming`, `toolbar`, `view-api`, `plugin`, `settings` | The real view, helpers and plugin driven through DOM events (clicks, drags, key presses, right-clicks, drops) in jsdom                                                                                |

### The Obsidian mock

The `obsidian` npm package only contains types, so tests alias it to `test/mocks/obsidian.ts`
(see `vitest.config.mts`). The mock is a small in-memory vault, workspace, menus, modals and settings
widgets. Its vault can rename a folder the way Obsidian does (one event for the folder, then one per file),
either with the vault "staged" (not yet consistent when the first event arrives) or "settled", which is how
the folder-rename bug is covered. `test/setup.ts` adds Obsidian's DOM helpers (`createDiv`, `toggleClass`, ...)
and a `FakeAudio`; `test/helpers/fixture.ts` opens a real `SoundboardView` for tests.

### What is not covered

These tests run against a mock, so they cannot catch differences between the mock and real Obsidian
(event ordering, drag-and-drop from the file explorer, real audio). Before a release, open the built
plugin in a test vault and try: import, a folder rename while sounds play, and a nested soundboard.
An end-to-end suite that drives a real Obsidian (for example with `wdio-obsidian-service`) would be
the next step.
