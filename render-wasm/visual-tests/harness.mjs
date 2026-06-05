// Image-diff harness for the headless render path. Loads the built render-wasm
// artifact in Node (no browser/WebGL), boots it with `init_headless`, renders a
// shape to PNG, and compares against a committed baseline with pixelmatch —
// the Playwright-snapshot equivalent for the headless renderer.
//
// Requires `./build` first (it loads frontend/resources/public/js/render-wasm.*,
// built with -sENVIRONMENT=web,node). Baselines live in ./__snapshots__; run
// with UPDATE_SNAPSHOTS=1 to (re)generate them.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import assert from "node:assert/strict";

// pngjs/pixelmatch are loaded lazily (only when actually diffing), so loading +
// rendering can be exercised without the diff dependencies installed.

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = resolve(here, "../../frontend/resources/public/js");
const SNAPSHOT_DIR = resolve(here, "__snapshots__");
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;

export const FILL_U8_SIZE = 160; // 4 + max(gradient 156, image 36, solid 4)

let modulePromise;

/// Loads + boots the headless module once (memoized). Returns `{ Module, call }`,
/// where `call(name, ...args)` invokes the `_<name>` export.
export function loadHeadlessModule(width = 800, height = 600) {
  modulePromise ??= (async () => {
    const wasmBytes = readFileSync(resolve(ARTIFACT_DIR, "render-wasm.wasm"));
    const factory = (await import(pathToFileURL(resolve(ARTIFACT_DIR, "render-wasm.js")).href))
      .default;

    const Module = await factory({
      instantiateWasm(imports, success) {
        WebAssembly.instantiate(wasmBytes, imports).then(({ instance }) => success(instance));
        return {};
      },
      locateFile: (p) => resolve(ARTIFACT_DIR, p),
      printErr: () => {},
    });

    const call = (name, ...args) => {
      const fn = Module["_" + name];
      if (typeof fn !== "function") throw new Error(`export _${name} missing`);
      return fn(...args);
    };

    call("init_headless", width, height);
    return { Module, call };
  })();
  return modulePromise;
}

/// Writes `colorsARGB` (one solid fill each, ARGB) to the current shape.
export function setSolidFills({ Module, call }, colorsARGB) {
  const size = 4 + colorsARGB.length * FILL_U8_SIZE;
  const ptr = call("alloc_bytes", size);
  const buf = Module.HEAPU8.subarray(ptr, ptr + size);
  buf.fill(0);
  buf[0] = colorsARGB.length; // num fills (bytes 1..4 are padding)
  const dv = new DataView(buf.buffer, buf.byteOffset, size);
  colorsARGB.forEach((argb, i) => {
    const off = 4 + i * FILL_U8_SIZE;
    dv.setUint8(off, 0x00); // Solid tag
    dv.setUint32(off + 4, argb >>> 0, true); // ARGB, little-endian
  });
  call("set_shape_fills");
}

/// Renders the subtree rooted at `id` (a [u32, u32, u32, u32] quartet) to PNG
/// bytes via `render_shape_raster`.
export function renderToPng({ Module, call }, id, scale = 1) {
  const [a, b, c, d] = id;
  const ptr = call("render_shape_raster", a, b, c, d, scale);
  const base = ptr >>> 2;
  const len = Module.HEAPU32[base];
  const png = Module.HEAPU8.slice(ptr + 12, ptr + 12 + len); // skip [len][w][h]
  call("free_bytes");
  return Buffer.from(png);
}

/// Compares `pngBytes` against ./__snapshots__/<name>.png. Creates the baseline
/// when missing or when UPDATE_SNAPSHOTS=1; otherwise fails (and writes a diff
/// PNG) when more than `maxDiffPixels` differ.
export async function expectMatchesSnapshot(
  name,
  pngBytes,
  { maxDiffPixels = 0, threshold = 0.1 } = {},
) {
  const baseline = join(SNAPSHOT_DIR, `${name}.png`);

  if (UPDATE || !existsSync(baseline)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(baseline, pngBytes);
    return;
  }

  const { PNG } = await import("pngjs");
  const { default: pixelmatch } = await import("pixelmatch");

  const actual = PNG.sync.read(pngBytes);
  const expected = PNG.sync.read(readFileSync(baseline));
  assert.equal(
    `${actual.width}x${actual.height}`,
    `${expected.width}x${expected.height}`,
    `${name}: dimensions differ from baseline`,
  );

  const diff = new PNG({ width: actual.width, height: actual.height });
  const n = pixelmatch(actual.data, expected.data, diff.data, actual.width, actual.height, {
    threshold,
  });
  if (n > maxDiffPixels) {
    const diffPath = join(SNAPSHOT_DIR, `${name}.diff.png`);
    writeFileSync(diffPath, PNG.sync.write(diff));
    assert.fail(`${name}: ${n} differing pixels (> ${maxDiffPixels}); diff written to ${diffPath}`);
  }
}
