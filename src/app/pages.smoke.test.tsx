import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { http, HttpResponse } from "msw";
import { redirect } from "next/navigation";
import { render, renderWithProviders, screen, signIn, userEvent, waitFor } from "@/test/render";
import { API, server } from "@/test/server";
import { EARLY_DIR_SCRIPT } from "@/lib/i18n";

import RootPage from "./page";
import NotFound from "./not-found";
import RootLayout from "./layout";
import AdminError from "./(admin)/error";
import HelpPage, { metadata as helpMetadata } from "./(admin)/help/page";
import FullWidthPageLayout from "./(full-width-pages)/layout";
import SignUp from "./(full-width-pages)/(auth)/signup/page";

describe("redirect pages", () => {
  it("sends the site's main address to the home page", () => {
    RootPage();
    expect(redirect).toHaveBeenLastCalledWith("/home");
  });

  it("sends the old sign-up page to sign-in", () => {
    SignUp();
    expect(redirect).toHaveBeenLastCalledWith("/signin");
  });
});

describe.each([
  ["not-found", NotFound],
])("%s page", (_name, Page) => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
  });
  afterEach(() => vi.useRealTimers());

  it("explains the page is missing and links home", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: "ERROR" })).toBeInTheDocument();
    expect(screen.getByText("We can’t seem to find the page you are looking for!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home Page" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("img", { name: "404" })).toHaveLength(2);
    expect(screen.getByText(/© 2026 - Nexo InOuty/)).toBeInTheDocument();
  });
});

describe("root layout", () => {
  type El = React.ReactElement<{ children?: React.ReactNode; className?: string; lang?: string; dir?: string; dangerouslySetInnerHTML?: { __html: string } }>;
  const tree = () => RootLayout({ children: <p>Page body</p> }) as El;

  it("starts the document in English, left to right, with the early language script", () => {
    const html = tree();
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.dir).toBe("ltr");
    const [head] = React.Children.toArray(html.props.children) as El[];
    const script = React.Children.only(head.props.children) as El;
    expect(script.props.dangerouslySetInnerHTML?.__html).toBe(EARLY_DIR_SCRIPT);
  });

  it("renders the page inside the app's providers and feedback host", async () => {
    signIn();
    const [, body] = React.Children.toArray(tree().props.children) as El[];
    expect(body.props.className).toContain("font");
    render(<>{body.props.children}</>);
    expect(await screen.findByText("Page body")).toBeInTheDocument();
  });
});

describe("admin error page", () => {
  const realLocation = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  });

  it("reports the crash and offers to try again", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reported: unknown[] = [];
    server.use(
      http.post(`${API}/error-logs/client`, async ({ request }) => {
        reported.push(await request.json());
        return HttpResponse.json({});
      })
    );
    localStorage.setItem("auth_token", "token");
    const reset = vi.fn();
    const error = Object.assign(new Error("Boom on the page"), { digest: "d1" });
    render(<AdminError error={error} reset={reset} />);
    expect(screen.getByRole("heading", { name: "This page ran into a problem" })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("Page crashed", error);
    await waitFor(() => expect(reported).toHaveLength(1));
    expect(reported[0]).toMatchObject({ message: "Boom on the page", digest: "d1" });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reloads the page on request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...realLocation, href: "http://localhost/home", reload }, configurable: true });
    render(<AdminError error={new Error("x")} reset={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Reload page" }));
    expect(reload).toHaveBeenCalled();
  });
});

describe("full-width layout", () => {
  it("wraps its page", () => {
    render(
      <FullWidthPageLayout>
        <p>Sign in form</p>
      </FullWidthPageLayout>
    );
    expect(screen.getByText("Sign in form").parentElement?.tagName).toBe("DIV");
  });
});

describe("help page", () => {
  it("shows the help view and names the tab", async () => {
    renderWithProviders(<HelpPage />, { url: "/help" });
    expect(await screen.findByRole("heading", { name: "Help & guides" })).toBeInTheDocument();
    expect(helpMetadata.title).toBe("Help & guides | Nexo InOuty");
  });
});

