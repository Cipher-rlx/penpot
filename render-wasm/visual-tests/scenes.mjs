// Scene builders for the headless image-diff tests, constructed through the
// WASM FFI (no .penpot file needed). Real files require the shape-tree
// serialization that lives in the exporter; once that's available as a JS
// module it can build scenes for this same harness.

import { setSolidFills } from "./harness.mjs";

const ROOT = [1, 2, 3, 4]; // any fixed non-nil uuid; the pool is reset per scene

/// A single rectangle with one or more stacked solid fills (ARGB). `fills[0]`
/// draws on top, matching Penpot's fill order.
export function solidRect(mod, { width, height, fills }) {
  const { call } = mod;
  call("init_shapes_pool", 1);
  call("use_shape", ...ROOT);
  call("set_shape_selrect", 0, 0, width, height);
  setSolidFills(mod, fills);
  return ROOT;
}
