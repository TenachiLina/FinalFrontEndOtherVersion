import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { act, render, screen, userEvent, within } from "@/test/render";
import { ThemeProvider } from "@/context/ThemeContext";
import { getLang, setLang } from "@/lib/i18n";
import ComponentCard from "./ComponentCard";
import GridShape from "./GridShape";
import LanguageSwitcher from "./LanguageSwitcher";
import PageBreadcrumb from "./PageBreadCrumb";
import { ThemeToggleButton } from "./ThemeToggleButton";
import ThemeTogglerTwo from "./ThemeTogglerTwo";
import Tooltip from "./Tooltip";

afterEach(() => {
  act(() => setLang("en"));
});

describe("ComponentCard", () => {
  it("shows a translated title, its content and no description by default", () => {
    const { container } = render(
      <ComponentCard title="Users" className="mt-2">
        <p>Body</p>
      </ComponentCard>
    );
    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("mt-2");
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("shows a description and translates both", () => {
    setLang("fr");
    render(
      <ComponentCard title="Users" desc="Language">
        x
      </ComponentCard>
    );
    expect(screen.getByRole("heading", { name: "Utilisateurs" })).toBeInTheDocument();
    expect(screen.getByText("Langue")).toBeInTheDocument();
  });
});

describe("GridShape", () => {
  it("draws the two decorative grids", () => {
    render(<GridShape />);
    const grids = screen.getAllByRole("img", { name: "grid" });
    expect(grids).toHaveLength(2);
    expect(grids[0]).toHaveAttribute("src", "/images/shape/grid-01.svg");
  });
});

describe("PageBreadcrumb", () => {
  it("shows the page title and a link home", () => {
    render(<PageBreadcrumb pageTitle="Users" />);
    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getAllByText("Users")).toHaveLength(2);
  });
});

describe("LanguageSwitcher", () => {
  const toggle = () => screen.getByRole("button", { name: "Language" });

  it("shows the current language, closed", () => {
    render(<LanguageSwitcher className="ms-2" />);
    expect(toggle()).toHaveTextContent("English");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle().parentElement).toHaveClass("ms-2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("lists the languages with the current one selected", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["English", "Français", "العربية"]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("lang", "ar");
  });

  it("switches language, remembers it and closes", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("option", { name: "العربية" }));
    expect(getLang()).toBe("ar");
    expect(localStorage.getItem("lang")).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اللغة" })).toHaveTextContent("العربية");
  });

  it("closes with its toggle and on a click outside", async () => {
    render(
      <>
        <LanguageSwitcher />
        <p>Outside</p>
      </>
    );
    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(toggle());
    await userEvent.click(screen.getByText("Outside"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // BUG-710: the language menu ignores Escape, so keyboard users can't close it without picking a language
  it.fails("closes on Escape", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(toggle());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe.each([
  ["ThemeToggleButton", ThemeToggleButton],
  ["ThemeTogglerTwo", ThemeTogglerTwo],
])("%s", (_name, Toggle) => {
  it("switches between light and dark mode", async () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>
    );
    const button = screen.getByRole("button");
    await userEvent.click(button);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    await userEvent.click(button);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  // BUG-711: the theme toggle buttons only contain icons and have no accessible name
  it.fails("has an accessible name", () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: /theme|dark|light/i })).toBeInTheDocument();
  });
});

describe("Tooltip", () => {
  const realWidth = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { value: realWidth, configurable: true });
  });

  function place(el: HTMLElement, left: number, width = 40, top = 100) {
    el.getBoundingClientRect = () => ({ left, top, width, height: 20, right: left + width, bottom: top + 20, x: left, y: top, toJSON: () => ({}) });
  }
  const bubble = () => screen.queryByText("Starts at 08:00");

  it("shows the translated text above the element on hover and hides it after", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    render(
      <Tooltip text="Starts at 08:00">
        <span>Shift</span>
      </Tooltip>
    );
    place(screen.getByText("Shift").parentElement!, 500);
    expect(bubble()).not.toBeInTheDocument();
    await userEvent.hover(screen.getByText("Shift"));
    expect(bubble()).toHaveStyle({ left: "380px", top: "92px" }); // 500 + 20 - 140, 100 - 8
    await userEvent.unhover(screen.getByText("Shift"));
    expect(bubble()).not.toBeInTheDocument();
  });

  it("keeps the tooltip inside the left edge", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    render(
      <Tooltip text="Starts at 08:00">
        <span>Shift</span>
      </Tooltip>
    );
    place(screen.getByText("Shift").parentElement!, 0);
    await userEvent.hover(screen.getByText("Shift"));
    expect(bubble()).toHaveStyle({ left: "10px" });
  });

  it("keeps the tooltip inside the right edge", async () => {
    Object.defineProperty(window, "innerWidth", { value: 600, configurable: true });
    render(
      <Tooltip text="Starts at 08:00">
        <span>Shift</span>
      </Tooltip>
    );
    place(screen.getByText("Shift").parentElement!, 580);
    await userEvent.hover(screen.getByText("Shift"));
    expect(bubble()).toHaveStyle({ left: "310px" }); // 600 - 280 - 10
  });

  it("is translated", async () => {
    setLang("fr");
    render(
      <Tooltip text="Language">
        <span>?</span>
      </Tooltip>
    );
    await userEvent.hover(screen.getByText("?"));
    expect(screen.getByText("Langue")).toBeInTheDocument();
  });

  // BUG-712: Tooltip only reacts to mouse hover; keyboard users focusing the element never see the text
  it.fails("shows the text when the element gets keyboard focus", async () => {
    render(
      <Tooltip text="Starts at 08:00">
        <button>Shift</button>
      </Tooltip>
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Shift" })).toHaveFocus();
    expect(bubble()).toBeInTheDocument();
  });
});

