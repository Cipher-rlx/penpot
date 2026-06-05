# Headless visual tests

Image-diff tests for the **headless** render path — the GPU-free Skia pipeline
(`init_headless` + `render_shape_raster`) that powers server-side export. They're
the Playwright-snapshot equivalent for code that runs with no browser/WebGL:
boot the built WASM in Node, render a scene to PNG, and compare against a
committed baseline with pixelmatch.

## Running

```bash
./build                       # produce frontend/resources/public/js/render-wasm.*
pnpm install                  # one-time, pulls pngjs + pixelmatch
pnpm test:headless            # diff against baselines in __snapshots__/
pnpm test:headless:update     # (re)generate baselines, then review + commit them
```

A failing case writes `__snapshots__/<name>.diff.png` highlighting the changed
pixels. Baselines are produced by CPU Skia, so they're deterministic across
machines.

## Scenes

Scenes are built through the WASM FFI in `scenes.mjs` (no `.penpot` file needed),
so the suite is self-contained on this branch. Rendering real files headless
needs the shape-tree serialization that lives in the exporter; once that's
exposed as a JS module it can feed `renderToPng` through this same harness.

- `harness.mjs` — load/boot the headless module, build fills, render to PNG,
  snapshot compare.
- `scenes.mjs` — FFI scene builders.
- `*.test.mjs` — `node:test` cases.
- `__snapshots__/` — committed baseline PNGs.
