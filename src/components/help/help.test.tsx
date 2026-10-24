import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, render, renderWithProviders, screen, userEvent, within } from "@/test/render";
import { makeCompany, makeUser } from "@/test/factories";
import { setLang } from "@/lib/i18n";
import HelpView from "./HelpView";
import GuideVideo from "./GuideVideo";
import { FAQ, GUIDES, SUPPORT } from "./content";
import { SCENES, SceneStage, type Scene } from "./scenes";

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

  it("has one animated scene per step for every guide, and no scenes without a guide", () => {
    for (const g of GUIDES) {
      expect(SCENES[g.id], `scenes for ${g.id}`).toBeDefined();
      expect(SCENES[g.id], `scene count for ${g.id}`).toHaveLength(g.steps.en.length);
    }
    const guideIds = new Set(GUIDES.map((g) => g.id));
    expect(Object.keys(SCENES).filter((id) => !guideIds.has(id))).toEqual([]);
  });

  it("draws every element the cursor goes to, at the moment it goes there", () => {
    const missing: string[] = [];
    for (const [guide, scenes] of Object.entries(SCENES)) {
      scenes.forEach((scene, n) => {
        const flags = new Set(scene.flags ?? []);
        for (const action of scene.actions) {
          const { container, unmount } = render(
            <SceneStage scene={scene} state={{ flags: new Set(flags), typed: {}, active: null, menu: scene.menu ?? null }} />
          );
          if (!container.querySelector(`[data-target="${CSS.escape(action.target)}"]`)) {
            missing.push(`${guide} step ${n + 1}: ${action.target}`);
          }
          unmount();
          action.sets?.split(" ").forEach((f) => flags.add(f));
        }
      });
    }
    expect(missing).toEqual([]);
  });
});

// ─── SceneStage ──────────────────────────────────────────────────────────

describe("SceneStage", () => {
  const stage = (scene: Scene, flags: string[] = [], extra: Partial<{ typed: Record<string, string>; active: string }> = {}) =>
    render(<SceneStage scene={scene} state={{ flags: new Set(flags), typed: extra.typed ?? {}, active: extra.active ?? null, menu: scene.menu ?? null }} />);

  it("shows the sign-in screen full size, without the app menu", () => {
    stage({ screen: "signin", actions: [] });
    expect(screen.getAllByText("Sign in").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nexo InOuty")).not.toBeInTheDocument();
  });

  it("shows other screens inside the app menu, with the current item highlighted", () => {
    const { container } = stage({ screen: "home", menu: "home", actions: [] }, ["open:planning"]);
    expect(screen.getByText("Nexo InOuty")).toBeInTheDocument();
    expect(container.querySelector('[data-target="menu:home"]')).toHaveClass("bg-brand-50");
    expect(screen.getByText("New Planning")).toBeInTheDocument();
  });

  it("shows typed text and the focused field", () => {
    const { container } = stage({ screen: "signin", actions: [] }, [], { typed: { email: "sara@nexo.dz" }, active: "email" });
    expect(screen.getByText("sara@nexo.dz")).toBeInTheDocument();
    expect(container.querySelector('[data-target="email"]')).toHaveClass("border-brand-400");
  });

  it("opens the language and user menus and switches to French", () => {
    stage({ screen: "home", menu: "home", actions: [] }, ["langMenu", "userMenu", "fr"]);
    expect(screen.getAllByText("Français").length).toBeGreaterThan(1);
    expect(screen.getByText("Change password")).toBeInTheDocument();
  });

  it("draws every guide step in its final state (after all its clicks)", () => {
    for (const scenes of Object.values(SCENES)) {
      for (const scene of scenes) {
        const flags = [...(scene.flags ?? []), ...scene.actions.flatMap((a) => a.sets?.split(" ") ?? [])];
        const { container, unmount } = stage(scene, flags);
        expect(container.querySelectorAll("[data-target]").length).toBeGreaterThan(0);
        unmount();
      }
    }
    // e.g. the payroll details and the open role list
    stage({ screen: "payroll", menu: "reporting", actions: [] }, ["details"]);
    expect(screen.getByText("Mon")).toBeInTheDocument();
  });

  it("is translated", () => {
    setLang("fr");
    stage({ screen: "home", menu: "home", actions: [] });
    expect(screen.getByText("Accueil")).toBeInTheDocument();
  });
});

// ─── GuideVideo ──────────────────────────────────────────────────────────

const twoSteps: Scene[] = [
  { screen: "home", menu: "home", actions: [{ target: "home-cards" }] },
  { screen: "signin", actions: [{ target: "email", type: "ab" }] },
];
const captions = ["Open the home page", "Type your email"];

describe("GuideVideo", () => {
  const region = () => screen.getByRole("region", { name: "Demo guide" });

  it("starts on a poster for step 1", () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
    expect(region()).toHaveAttribute("aria-roledescription", "Video guide");
    expect(screen.getByRole("button", { name: "Play the guide (2 steps)" })).toBeInTheDocument();
    expect(screen.getByText("Open the home page")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("plays and pauses", async () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
    await userEvent.click(screen.getByRole("button", { name: "Play the guide (2 steps)" }));
    expect(screen.queryByRole("button", { name: /Play the guide/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("moves between steps with the buttons and the progress bar", async () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByText("Type your email")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Step 2" })).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Step 2" }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    // a finished step's bar is full, the next ones empty
    const bars = within(screen.getByRole("group", { name: "Steps" })).getAllByRole("button");
    expect((bars[0].querySelector("span span") as HTMLElement).style.width).toBe("100%");
    expect((bars[1].querySelector("span span") as HTMLElement).style.width).toBe("0%");
  });

  it("replays from the first step", async () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("is driven by the keyboard", async () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
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
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} />);
    region().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("only shows as many steps as there are captions", () => {
    render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={["Only one"]} />);
    expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();
  });

  describe("playing over time", () => {

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
      // The stage is only drawn when it has a width
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    });
    afterEach(() => {
      vi.useRealTimers();
      // back to jsdom's own getter on Element.prototype
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    });
    const advance = (ms: number) => {
      for (let t = 0; t < ms; t += 40) act(() => vi.advanceTimersByTime(40));
    };
    const cursor = (container: HTMLElement) => container.querySelector(".z-30") as HTMLElement | null;

    it("draws the scaled scene, moves the cursor, clicks and types", () => {
      const { container } = render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} autoPlay />);
      expect(screen.queryByRole("button", { name: /Play the guide/ })).not.toBeInTheDocument();
      const frame = region().firstElementChild as HTMLElement;
      expect(frame.style.height).toBe("225px"); // 450 * 400/800
      expect(screen.getByText("Nexo InOuty")).toBeInTheDocument();
      expect(cursor(container)).toBeNull();
      advance(600); // cursor appears and glides
      expect(cursor(container)).toBeInTheDocument();
      expect(cursor(container)!.style.transition).toContain("transform");
      advance(900); // click
      expect(container.querySelector(".animate-ping")).toBeInTheDocument();
      expect(container.querySelector('[data-target="home-cards"]')).toHaveClass("ring-2");
      advance(2300); // next step
      expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
      advance(2000); // typing done
      expect(screen.getByText("ab")).toBeInTheDocument();
    });

    it("ends on a Watch again screen and restarts from there", () => {
      render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} autoPlay />);
      advance(8000);
      const again = screen.getByRole("button", { name: "Watch again" });
      expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      fireEvent.click(again);
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    });

    it("doesn't move while paused", () => {
      render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} autoPlay />);
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
      advance(5000);
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    });

    it("moves the cursor without animation for people who prefer reduced motion", () => {
      const realMatchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: true })) as typeof window.matchMedia;
      try {
        const { container } = render(<GuideVideo title="Demo guide" scenes={twoSteps} captions={captions} autoPlay />);
        advance(600);
        expect(cursor(container)!.style.transition).toBe("none");
      } finally {
        window.matchMedia = realMatchMedia;
      }
    });
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
