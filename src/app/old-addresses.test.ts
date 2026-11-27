import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import nextConfig, { OLD_ADDRESSES } from "../../next.config";

// The pages were renamed (/basic-tables → /employees…). Bookmarks and links
// in old emails must keep working: every old address redirects to a page
// that exists.
describe("old addresses", () => {
  it("each one redirects, permanently, to its new address", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(OLD_ADDRESSES.map(([source, destination]) => ({ source, destination, permanent: true })));
    expect(redirects.length).toBeGreaterThanOrEqual(9);
  });

  it.each(OLD_ADDRESSES)("%s leads to %s, a page that exists", (_old, destination) => {
    expect(existsSync(join(__dirname, "(admin)", ...destination.split("/").filter(Boolean), "page.tsx"))).toBe(true);
  });

  it.each(OLD_ADDRESSES)("%s is not a page any more", (old) => {
    const parts = old.split("/").filter(Boolean);
    expect(existsSync(join(__dirname, "(admin)", ...parts, "page.tsx"))).toBe(false);
  });

  it("no new address is itself an old one (no redirect chains)", () => {
    const olds = new Set(OLD_ADDRESSES.map(([o]) => o));
    expect(OLD_ADDRESSES.filter(([, to]) => olds.has(to))).toEqual([]);
  });
});
