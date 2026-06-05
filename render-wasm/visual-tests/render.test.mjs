import { test } from "node:test";

import { loadHeadlessModule, renderToPng, expectMatchesSnapshot } from "./harness.mjs";
import { solidRect } from "./scenes.mjs";

test("solid red rect", async () => {
  const mod = await loadHeadlessModule();
  const id = solidRect(mod, { width: 120, height: 80, fills: [0xffff0000] });
  await expectMatchesSnapshot("solid-red-rect", renderToPng(mod, id, 1));
});

test("stacked translucent fills", async () => {
  const mod = await loadHeadlessModule();
  // fills[0] draws on top: 50% blue over opaque red → blended purple
  const id = solidRect(mod, { width: 120, height: 80, fills: [0x800000ff, 0xffff0000] });
  await expectMatchesSnapshot("stacked-fills", renderToPng(mod, id, 2));
});
