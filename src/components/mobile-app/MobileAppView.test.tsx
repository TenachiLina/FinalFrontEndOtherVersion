import { afterEach, describe, expect, it, vi } from "vitest";
import MobileAppView from "./MobileAppView";
import MobileAppPage from "@/app/(admin)/mobile-app/page";
import AdminLayout from "@/app/(admin)/layout";
import { makeCompany, makeUser } from "@/test/factories";
import { renderWithProviders, screen, waitFor, within } from "@/test/render";

const ANDROID = "https://play.google.com/store/apps/details?id=dz.restaurant.staff.employee_app";
const IOS = "https://apps.apple.com/app/nexo-inouty/id123";

afterEach(() => vi.unstubAllEnvs());

function published(android = ANDROID, ios = IOS) {
  vi.stubEnv("NEXT_PUBLIC_ANDROID_APP_URL", android);
  vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", ios);
}

describe("MobileAppView", () => {
  it("says the app isn't on the stores yet, and how employees get an account", () => {
    published("", "");
    renderWithProviders(<MobileAppView />);
    expect(screen.getByRole("status")).toHaveTextContent("The app isn't on the stores yet");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Share on WhatsApp" })).not.toBeInTheDocument();
    expect(screen.getByText(/Users → Add user → Mobile app employee/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to Users/ })).toHaveAttribute("href", "/users");
  });

  it("shows a QR code and the link for each store, and shares the download message", async () => {
    published();
    const { user } = renderWithProviders(<MobileAppView />, { company: makeCompany({ name: "Pizzeria Roma" }) });

    const android = screen.getByTestId("store-android");
    expect(within(android).getByText("Android · Google Play")).toBeInTheDocument();
    expect(within(android).getByRole("link", { name: ANDROID })).toHaveAttribute("href", ANDROID);
    const qr = await within(android).findByRole("img", { name: "QR code to download the app on Android" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(within(screen.getByTestId("store-ios")).getByRole("link", { name: IOS })).toBeInTheDocument();

    const message = (screen.getByLabelText("Message") as HTMLTextAreaElement).value;
    expect(message).toContain("Pizzeria Roma");
    expect(message).toContain(ANDROID);
    const whatsapp = screen.getByRole("link", { name: "Share on WhatsApp" });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain(IOS);

    await user.click(screen.getByRole("button", { name: "العربية" }));
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toContain("حمّل التطبيق:");

    await user.click(within(android).getByRole("button", { name: "Copy link" }));
    expect(await navigator.clipboard.readText()).toBe(ANDROID);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy message" }));
    expect(await navigator.clipboard.readText()).toContain("حمّل التطبيق:");
  });

  it("shows only the stores where the app is published", () => {
    published(ANDROID, "");
    renderWithProviders(<MobileAppView />);
    expect(screen.getByTestId("store-android")).toBeInTheDocument();
    expect(screen.queryByTestId("store-ios")).not.toBeInTheDocument();
  });

  it("prints a poster with the QR codes", async () => {
    published();
    const doc = { write: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue({ document: doc } as unknown as Window);
    const { user } = renderWithProviders(<MobileAppView />, { company: makeCompany({ name: "Pizzeria <Roma>" }) });
    await user.click(screen.getByRole("button", { name: "Print a poster with the QR codes" }));
    await waitFor(() => expect(doc.write).toHaveBeenCalled());
    const html = doc.write.mock.calls[0][0] as string;
    expect(html).toContain("Pizzeria &lt;Roma&gt;");
    expect(html.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).toContain("window.print()");
    expect(doc.close).toHaveBeenCalled();

    open.mockReturnValue(null);
    await user.click(screen.getByRole("button", { name: "Print a poster with the QR codes" }));
    expect(await screen.findByText("Allow pop-ups for this site to print the poster.")).toBeInTheDocument();
    open.mockRestore();
  });

  it("doesn't link to Users for a manager", () => {
    published("", "");
    renderWithProviders(<MobileAppView />, { user: makeUser({ role: "manager" }) });
    expect(screen.queryByRole("link", { name: /Go to Users/ })).not.toBeInTheDocument();
  });

  it("renders inside the Mobile app page, and is in the menu for managers", async () => {
    published("", "");
    renderWithProviders(<MobileAppPage />);
    expect(screen.getByText("The employee app")).toBeInTheDocument();

    renderWithProviders(<AdminLayout>Page content</AdminLayout>, { url: "/home", user: makeUser({ role: "manager" }) });
    const sidebar = await screen.findByRole("complementary", { hidden: true });
    expect(within(sidebar).getByRole("link", { name: /Mobile app/ })).toHaveAttribute("href", "/mobile-app");
  });
});
