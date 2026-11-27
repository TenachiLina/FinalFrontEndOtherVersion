import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "@playwright/test";
import { SCENES } from "../src/components/help/scenes";
import { mockApi, signInAs } from "./mock-api";

// The Help page's guides play on the real pages, in demo mode. Every step of
// every guide is played here on the built app: if a button or a field a
// guide points at is renamed or removed, this test names the guide and step.

// The target finder, in plain JavaScript for the page (the same code the guides use)
const finder = ts
  .transpileModule(fs.readFileSync(path.join(__dirname, "../src/components/help/demoFrame.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 },
  })
  .outputText.replace(/^export /gm, "")
  .replace(/Object\.defineProperty\(exports[^\n]*\n/, "")
  .replace(/exports\.\w+ = [^;]+;\n?/g, "");

test.describe.configure({ timeout: 300_000 });

for (const [guide, scenes] of Object.entries(SCENES)) {
  test(`the "${guide}" guide finds everything it points at`, async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "admin@roma.dz");
    await expect(page).toHaveURL(/\/home$/);
    await page.addScriptTag({ content: `${finder}\nwindow.__find = findTarget; window.__settled = frameSettled;` });

    const missing = await page.evaluate(async (steps) => {
      const w = window as unknown as {
        __find: (doc: Document, target: unknown) => HTMLElement | null;
        __settled: (doc: Document | null, loading: string) => boolean;
      };
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const problems: string[] = [];
      for (let n = 0; n < steps.length; n++) {
        const step = steps[n];
        const frame = document.createElement("iframe");
        frame.name = step.signedOut ? "nexo-demo-signed-out" : "nexo-demo";
        frame.style.cssText = "position:fixed;left:0;top:0;width:1280px;height:720px;z-index:9999";
        frame.src = step.path;
        document.body.appendChild(frame);
        for (let i = 0; i < 120; i++) {
          await wait(250);
          const doc = frame.contentDocument;
          if (doc && doc.location.pathname === step.path && w.__settled(doc, "Loading")) break;
        }
        await wait(400);
        const doc = frame.contentDocument!;
        for (const action of step.actions) {
          let el: HTMLElement | null = null;
          for (let i = 0; i < 16 && !el; i++) {
            el = w.__find(doc, action.target);
            if (!el) await wait(250);
          }
          if (!el) {
            problems.push(`step ${n + 1} (${step.path}): ${JSON.stringify(action.target)}`);
            continue;
          }
          if (action.type !== undefined) {
            const view = el.ownerDocument.defaultView!;
            const proto = el instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, action.type);
            el.dispatchEvent(new view.Event("input", { bubbles: true }));
          } else if (action.click !== false) {
            el.click();
          }
          await wait(300);
        }
        frame.remove();
      }
      return problems;
    }, scenes);

    expect(missing, `not found in the "${guide}" guide`).toEqual([]);
  });
}

test("a guide plays the real app, without touching the viewer's session", async ({ page }) => {
  await mockApi(page);
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);
  const before = await page.evaluate(() => localStorage.getItem("auth_user"));
  await page.goto("/help#guide-shifts");

  const guide = page.locator("#guide-shifts [aria-roledescription='Video guide']");
  const frame = page.frameLocator("#guide-shifts iframe[name='nexo-demo']");
  // The real Shifts page, with the sample company's shifts
  await expect(frame.getByRole("heading", { name: "Shifts Management" }).first()).toBeVisible({ timeout: 60_000 });
  await expect(frame.getByText("Pizza Roma").first()).toBeVisible();
  await expect(guide.getByTestId("guide-pointer")).toBeVisible({ timeout: 30_000 });

  // The viewer is still themselves, in their own company
  expect(await page.evaluate(() => localStorage.getItem("auth_user"))).toBe(before);
  await expect(page.getByText("Amina Admin").first()).toBeVisible();
});
