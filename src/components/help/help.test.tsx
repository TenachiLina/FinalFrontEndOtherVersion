import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, render, renderWithProviders, screen, userEvent, within } from "@/test/render";
import { makeCompany, makeUser } from "@/test/factories";
import { setLang } from "@/lib/i18n";
import HelpView from "./HelpView";
import GuideVideo, { durationOf, openPage, playback, timingsOf } from "./GuideVideo";
import { FAQ, GUIDES, SUPPORT } from "./content";
import { DESIGN_H, DESIGN_W, SCENES, type Scene } from "./scenes";

afterEach(() => {
  act(() => setLang("en"));
  document.dir = "";
});

// ─── content.ts / scenes.tsx consistency ─────────────────────────────────

/** Every route of the app, from the page.tsx files (route groups removed). */
function appRoutes(): Set<string> {
  const root = path.resolve(__dirname, "../../app");
  const routes = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        const rel = path.relative(root, dir).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
        routes.add("/" + rel.join("/"));
      }
    }
  };
  walk(root);
  return routes;
}

describe("help content", () => {
  const langs = ["en", "fr", "ar"] as const;

  it("has unique guide and question ids", () => {
    const guideIds = GUIDES.map((g) => g.id);
    const faqIds = FAQ.map((f) => f.id);
    expect(new Set(guideIds).size).toBe(guideIds.length);
    expect(new Set(faqIds).size).toBe(faqIds.length);
  });

  it("has every text in the three languages", () => {
    for (const g of GUIDES) {
      for (const lang of langs) {
        expect(g.title[lang], `${g.id} title ${lang}`).toBeTruthy();
        expect(g.intro[lang], `${g.id} intro ${lang}`).toBeTruthy();
        expect(g.steps[lang].every(Boolean), `${g.id} steps ${lang}`).toBe(true);
      }
      expect(g.steps.fr, `${g.id} fr steps`).toHaveLength(g.steps.en.length);
      expect(g.steps.ar, `${g.id} ar steps`).toHaveLength(g.steps.en.length);
    }
    for (const f of FAQ) {
      for (const lang of langs) {
        expect(f.q[lang], `${f.id} q ${lang}`).toBeTruthy();
        expect(f.a[lang], `${f.id} a ${lang}`).toBeTruthy();
      }
    }
  });

  it("only points to pages that exist", () => {
    const routes = appRoutes();
    const paths = [...GUIDES, ...FAQ].map((x) => x.path).filter((p): p is string => !!p);
    expect(paths.filter((p) => !routes.has(p))).toEqual([]);
  });

  it("has one scene per step for every guide, and no scenes without a guide", () => {
    for (const g of GUIDES) {
      expect(SCENES[g.id], `scenes for ${g.id}`).toBeDefined();
      expect(SCENES[g.id], `scene count for ${g.id}`).toHaveLength(g.steps.en.length);
    }
    const guideIds = new Set(GUIDES.map((g) => g.id));
    expect(Object.keys(SCENES).filter((id) => !guideIds.has(id))).toEqual([]);
  });

  // Each step plays on a real page; e2e/guides.spec.ts plays them all on the built app
  it("plays every step on a page that exists, and points at something on it", () => {
    const routes = appRoutes();
    for (const [guide, scenes] of Object.entries(SCENES)) {
      scenes.forEach((scene, n) => {
        expect(routes.has(scene.path), `${guide} step ${n + 1}: ${scene.path}`).toBe(true);
        expect(scene.actions.length, `${guide} step ${n + 1} has actions`).toBeGreaterThan(0);
        for (const a of scene.actions) {
          expect(a.target.text || a.target.label || a.target.selector, `${guide} step ${n + 1}`).toBeTruthy();
        }
      });
    }
  });

  it("only signs out for the sign-in page", () => {
    const signedOut = Object.values(SCENES)
      .flat()
      .filter((s) => s.signedOut);
    expect(signedOut.length).toBeGreaterThan(0);
    expect(signedOut.every((s) => s.path === "/signin")).toBe(true);
  });
});

// ─── GuideVideo ──────────────────────────────────────────────────────────

const twoSteps: Scene[] = [
  { path: "/home", actions: [{ target: { text: "Today" }, click: false }] },
  { path: "/form", actions: [{ target: { label: "Name" }, type: "ab" }] },
];
const captions = ["Open the home page", "Type your name"];

/** Pages of a tiny app, opened by the player instead of real navigation. */
const PAGES: Record<string, string> = {
  "/home": `<main><h2>Today</h2><button>Refresh</button></main>`,
  "/form": `<main><label for="n">Name</label><input id="n" /></main>`,
};
/** Replaces the frame's document, as a page load does (a new document, fully loaded). */
const writePage = (frame: HTMLIFrameElement, html: string) => {
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><body>${html}</body></html>`);
  doc.close();
  // The frame is a window of its own: jsdom lays nothing out there either
  const proto = (frame.contentWindow as unknown as typeof globalThis).Element.prototype;
  proto.getClientRects = () => [{}] as unknown as DOMRectList;
  proto.getBoundingClientRect = () => ({ left: 100, top: 200, width: 80, height: 20, right: 180, bottom: 220, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect;
};
// jsdom never marks a frame's document complete: a page counts as loaded once it shows something other than Loading
const jsdomReady = (doc: Document) => !!doc.body?.textContent?.trim() && !doc.body.textContent.includes("Loading");
const opened: string[] = [];
const fakeOpen = (frame: HTMLIFrameElement, path: string) => {
  opened.push(path);
  writePage(frame, PAGES[path] ?? "<p>Loading…</p>");
};
const player = (props: Partial<React.ComponentProps<typeof GuideVideo>> = {}) => (
  <GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} open={fakeOpen} isReady={jsdomReady} {...props} />
);

describe("GuideVideo", () => {
  const region = () => screen.getByRole("region", { name: "Demo guide" });
  beforeEach(() => {
    opened.length = 0;
  });

  it("starts on a poster for step 1, saying it plays a sample company", () => {
    render(player());
    expect(region()).toHaveAttribute("aria-roledescription", "Video guide");
    expect(screen.getByRole("button", { name: /Play the guide \(2 steps\)/ })).toBeInTheDocument();
    expect(screen.getByText("Played on the real app with a sample company. Nothing is saved.")).toBeInTheDocument();
    expect(screen.getByText("Open the home page")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    // Nothing is loaded before the guide is played
    expect(screen.queryByTestId("guide-frame")).toBeNull();
  });

  it("plays and pauses", async () => {
    render(player());
    await userEvent.click(screen.getByRole("button", { name: /Play the guide/ }));
    expect(screen.queryByRole("button", { name: /Play the guide/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("moves between steps with the buttons and the progress bar", async () => {
    render(player());
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Type your name")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Step 2" })).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Step 2" }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    const bars = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    expect((bars[0].querySelector("span span") as HTMLElement).style.width).toBe("100%");
    expect((bars[1].querySelector("span span") as HTMLElement).style.width).toBe("0%");
  });

  it("replays from the first step", async () => {
    render(player());
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("is driven by the keyboard", async () => {
    render(player());
    region().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    await userEvent.keyboard("k");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    await userEvent.keyboard("x");
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("swaps the arrow keys right-to-left", async () => {
    document.dir = "rtl";
    render(player());
    region().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("only shows as many steps as there are captions", () => {
    render(player({ captions: ["Only one"] }));
    expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();
  });

  it("opens pages in place by default", () => {
    const replace = vi.fn();
    const frame = { contentWindow: { location: { replace } } } as unknown as HTMLIFrameElement;
    openPage(frame, "/home");
    expect(replace).toHaveBeenCalledWith("/home");
    const broken = { contentWindow: { location: { replace: () => { throw new Error("cross-origin"); } } }, src: "" } as unknown as HTMLIFrameElement;
    openPage(broken, "/form");
    expect(broken.src).toBe("/form");
  });

  describe("playing over time", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
      // The stage is only drawn when it has a width; jsdom lays nothing out
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 640 });
      vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, top: 200, width: 80, height: 20, right: 180, bottom: 220, x: 100, y: 200, toJSON: () => ({}) } as DOMRect);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    });
    const advance = (ms: number) => {
      for (let t = 0; t < ms; t += 40) act(() => vi.advanceTimersByTime(40));
    };
    const frameDoc = () => (screen.getByTestId("guide-frame") as HTMLIFrameElement).contentDocument!;

    it("opens the step's real page in demo mode, at desktop size, scaled to fit", () => {
      render(player({ autoPlay: true }));
      const frame = screen.getByTestId("guide-frame") as HTMLIFrameElement;
      expect(frame).toHaveAttribute("name", "nexo-demo");
      expect(frame.style.width).toBe(`${DESIGN_W}px`);
      const holder = region().firstElementChild as HTMLElement;
      expect(holder.style.height).toBe(`${DESIGN_H * (640 / DESIGN_W)}px`);
      expect(opened).toEqual(["/home"]);
    });

    it("waits for the page before the clock runs", () => {
      const slow = (frame: HTMLIFrameElement) => writePage(frame, "<p>Loading…</p>");
      render(player({ autoPlay: true, open: slow }));
      expect(screen.getByRole("status")).toHaveTextContent("Loading…");
      advance(3000);
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
      const bar = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button")[0];
      expect((bar.querySelector("span span") as HTMLElement).style.width).toBe("0%");
      // The page arrives: the guide goes on
      act(() => writePage(screen.getByTestId("guide-frame") as HTMLIFrameElement, PAGES["/home"]));
      advance(1500);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows a page that never finishes loading after a while, rather than waiting for ever", () => {
      render(player({ autoPlay: true, open: () => undefined }));
      advance(13_000);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("points at the target, highlights it, then types into the next step's field", () => {
      render(player({ autoPlay: true }));
      advance(600); // page settled
      expect(screen.queryByTestId("guide-pointer")).toBeNull();
      advance(1200); // the pointer goes to "Today"
      const pointer = screen.getByTestId("guide-pointer");
      expect(pointer.style.transform).toBe("translate(140px, 210px)");
      expect(pointer.style.transition).toContain("transform");
      expect(screen.getByTestId("guide-highlight").style.width).toBe("92px");
      advance(4000); // next step
      expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
      expect(opened).toEqual(["/home", "/form"]);
      advance(3500); // typed
      expect((frameDoc().getElementById("n") as HTMLInputElement).value).toBe("ab");
    });

    it("clicks a target when the action says so", () => {
      const onClick = vi.fn();
      const clicking: Scene[] = [{ path: "/home", actions: [{ target: { text: "Refresh", role: "button" } }] }];
      render(player({ autoPlay: true, scenes: clicking, captions: ["Refresh"] }));
      advance(600);
      frameDoc().querySelector("button")!.addEventListener("click", onClick);
      advance(2500);
      expect(onClick).toHaveBeenCalledTimes(1);
      advance(1000);
      expect(onClick).toHaveBeenCalledTimes(1); // once, not at every tick
    });

    it("waits for a target that isn't on the page yet", () => {
      const later: Scene[] = [{ path: "/home", actions: [{ target: { text: "Later" }, click: false }] }];
      render(player({ autoPlay: true, scenes: later, captions: ["Later"] }));
      advance(2500);
      expect(screen.queryByTestId("guide-pointer")).toBeNull();
      act(() => {
        frameDoc().body.insertAdjacentHTML("beforeend", "<p>Later</p>");
      });
      advance(200);
      expect(screen.getByTestId("guide-pointer")).toBeInTheDocument();
    });

    it("plays the sign-in page signed out", () => {
      render(player({ autoPlay: true, scenes: [{ path: "/signin", signedOut: true, actions: [{ target: { text: "x" } }] }], captions: ["Sign in"] }));
      expect(screen.getByTestId("guide-frame")).toHaveAttribute("name", "nexo-demo-signed-out");
    });

    it("ends on a Watch again screen and restarts from there", () => {
      render(player({ autoPlay: true }));
      advance(14_000);
      const again = screen.getByRole("button", { name: "Watch again" });
      expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
      fireEvent.click(again);
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("doesn't move while paused", () => {
      render(player({ autoPlay: true }));
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      advance(8000);
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    });

    it("moves the pointer without animation for people who prefer reduced motion", () => {
      const realMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: true })) as typeof window.matchMedia;
      try {
        render(player({ autoPlay: true }));
        advance(1800);
        expect(screen.getByTestId("guide-pointer").style.transition).toBe("none");
      } finally {
        window.matchMedia = realMatchMedia;
      }
    });
  });
});

describe("timeline", () => {
  it("gives each action time to move, click and type, and the caption time to be read", () => {
    const scene: Scene = { path: "/x", actions: [{ target: { text: "a" } }, { target: { label: "b" }, type: "abc" }] };
    const [first, second] = timingsOf(scene);
    expect(first.clickAt - first.moveAt).toBe(900);
    expect(second.moveAt).toBe(first.end);
    expect(second.end - second.clickAt).toBe(350 + 3 * 70 + 500);
    expect(durationOf(scene, "short")).toBe(second.end + 1800);
    expect(durationOf(scene, "x".repeat(100))).toBe(second.end + 3200);
    expect(durationOf({ path: "/x", actions: [] }, "")).toBe(700 + 1800);
  });

  it("stops at the end, and toggling from the end starts again", () => {
    const base = { step: 1, elapsed: 0, playing: true, started: true, ended: false, run: 3 };
    const done = playback(base, { type: "tick", dt: 5000, durations: [100, 1000] });
    expect(done).toMatchObject({ playing: false, ended: true, elapsed: 1000 });
    expect(playback(done, { type: "toggle" })).toMatchObject({ step: 0, playing: true, ended: false, run: 4 });
    expect(playback({ ...base, playing: false }, { type: "tick", dt: 99, durations: [1, 1] })).toEqual({ ...base, playing: false });
  });
});

// ─── HelpView ────────────────────────────────────────────────────────────

describe("HelpView", () => {
  const guideTitles = () =>
    Array.from(document.querySelectorAll<HTMLElement>("details[id^=guide-] > summary > span")).map((s) => s.firstChild?.textContent);
  const savedSupport = { ...SUPPORT };
  afterEach(() => {
    Object.assign(SUPPORT, savedSupport);
    history.replaceState(null, "", "/");
  });

  it("lists every guide and question for an admin, with the first guide open", async () => {
    renderWithProviders(<HelpView />, { url: "/help" });
    expect(await screen.findByRole("heading", { name: "Help & guides" })).toBeInTheDocument();
    expect(guideTitles()).toEqual(GUIDES.map((g) => g.title.en));
    expect(document.getElementById("guide-getting-started")).toHaveAttribute("open");
    expect(document.getElementById("guide-plan-week")).not.toHaveAttribute("open");
    expect(document.querySelectorAll('[aria-roledescription="Video guide"]')).toHaveLength(GUIDES.length);
    for (const f of FAQ) expect(screen.getByText(f.q.en)).toBeInTheDocument();
  });

  it("hides guides about pages a manager can't open", () => {
    renderWithProviders(<HelpView />, { user: makeUser({ role: "manager" }) });
    expect(guideTitles()).not.toContain("Users and roles");
    expect(guideTitles()).not.toContain("Company settings");
    expect(guideTitles()).toContain("Getting started");
    expect(guideTitles()).toHaveLength(GUIDES.length - 2);
  });

  it("hides guides about features the company doesn't have", () => {
    renderWithProviders(<HelpView />, { company: makeCompany({ features: ["reporting"] }) });
    expect(guideTitles()).not.toContain("Plan the week");
    expect(guideTitles()).toContain("Getting started");
  });

  it("only shows general help when signed out", () => {
    renderWithProviders(<HelpView />, { user: null });
    expect(guideTitles()).toEqual(GUIDES.filter((g) => !g.path).map((g) => g.title.en));
    expect(screen.queryByText(FAQ.find((f) => f.path)!.q.en)).not.toBeInTheDocument();
    expect(screen.getByText("Ask an admin of your company.")).toBeInTheDocument();
  });

  it("filters guides and questions by the search, opening the matches", async () => {
    const { user } = renderWithProviders(<HelpView />);
    await user.type(screen.getByRole("searchbox", { name: "Search the help" }), "PAYROLL");
    const titles = guideTitles();
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.length).toBeLessThan(GUIDES.length);
    document.querySelectorAll("details[id^=guide-]").forEach((d) => expect(d).toHaveAttribute("open"));
    document.querySelectorAll("details[id^=faq-]").forEach((d) => expect(d).toHaveAttribute("open"));
  });

  it("says so when nothing matches", async () => {
    const { user } = renderWithProviders(<HelpView />);
    await user.type(screen.getByRole("searchbox"), "zzzz-nothing");
    expect(screen.getByText("No guide matches your search.")).toBeInTheDocument();
    expect(screen.getByText("No question matches your search.")).toBeInTheDocument();
  });

  it("opens and plays the guide named in the address", () => {
    history.replaceState(null, "", "/help#guide-shifts");
    renderWithProviders(<HelpView />, { url: "/help" });
    const guide = document.getElementById("guide-shifts")!;
    expect(guide).toHaveAttribute("open");
    expect(document.getElementById("guide-getting-started")).not.toHaveAttribute("open");
    expect(within(guide).getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("follows a later change of the address, and ignores unknown guides", () => {
    renderWithProviders(<HelpView />, { url: "/help" });
    history.replaceState(null, "", "/help#guide-nope");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(document.getElementById("guide-getting-started")).toHaveAttribute("open");
    history.replaceState(null, "", "/help#guide-payroll");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(document.getElementById("guide-payroll")).toHaveAttribute("open");
  });

  it("tells an admin who to contact when no support details are set", () => {
    renderWithProviders(<HelpView />);
    expect(screen.getByText("Contact the team that set up the app for your company.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("tells a manager to ask an admin", () => {
    renderWithProviders(<HelpView />, { user: makeUser({ role: "manager" }) });
    expect(screen.getByText("Ask an admin of your company.")).toBeInTheDocument();
  });

  it("shows the support contacts when they are set", () => {
    Object.assign(SUPPORT, { email: "help@nexo.dz", phone: "+213 555 12 34", whatsapp: "+213 (555) 12-34", hours: "Sun–Thu 9–17" });
    renderWithProviders(<HelpView />);
    expect(screen.getByText(/Contact our support team\. Hours: Sun–Thu 9–17/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "help@nexo.dz" })).toHaveAttribute("href", "mailto:help@nexo.dz");
    expect(screen.getByRole("link", { name: "+213 555 12 34" })).toHaveAttribute("href", "tel:+2135551234");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/2135551234");
  });

  it("shows only the contacts that are set", () => {
    Object.assign(SUPPORT, { email: "", phone: "0555", whatsapp: "", hours: "" });
    renderWithProviders(<HelpView />);
    expect(screen.getByText("Contact our support team.")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("is shown in the chosen language", () => {
    setLang("fr");
    renderWithProviders(<HelpView />);
    expect(screen.getByRole("heading", { name: "Aide et guides" })).toBeInTheDocument();
    expect(guideTitles()[0]).toBe(GUIDES[0].title.fr);
  });
});
