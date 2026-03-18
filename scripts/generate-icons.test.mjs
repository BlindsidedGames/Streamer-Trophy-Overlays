import { describe, expect, it } from "vitest";

import { ICON_OUTPUTS, ICON_VARIANT_SIZES, buildIco } from "./generate-icons.mjs";

describe("icon generator", () => {
  it("builds a multi-size ico header from PNG variants", () => {
    const variants = ICON_VARIANT_SIZES.slice(0, 3).map((size, index) => ({
      size,
      png: Buffer.from([index + 1, index + 2, index + 3]),
    }));

    const ico = buildIco(variants);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(variants.length);
    expect(ico.readUInt8(6)).toBe(variants[0].size);
    expect(ico.readUInt32LE(14)).toBe(variants[0].png.length);
    expect(ico.readUInt32LE(18)).toBe(6 + variants.length * 16);
  });

  it("tracks the desktop and favicon outputs that generation must produce", () => {
    expect(ICON_OUTPUTS.desktopIco.endsWith("build-assets\\icon.ico")).toBe(true);
    expect(ICON_OUTPUTS.desktopPng.endsWith("build-assets\\icon.png")).toBe(true);
    expect(ICON_OUTPUTS.faviconPng.endsWith("public\\favicon.png")).toBe(true);
  });
});
