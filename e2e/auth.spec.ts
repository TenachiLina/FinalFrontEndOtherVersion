import { expect, test } from "@playwright/test";
import { API, jwt, mockApi, signInAs, users, company } from "./mock-api";

test.describe("sign-in", () => {
  test("an admin lands on the home page with the full menu", async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "admin@roma.dz");
    await expect(page).toHaveURL(/\/home$/);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Reporting")).toBeVisible();
    await expect(sidebar.getByText("Users")).toBeVisible();
  });

  test("a manager doesn't see the admin-only pages", async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "manager@roma.dz");
    await expect(page).toHaveURL(/\/home$/);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("button", { name: "Planning", exact: true })).toBeVisible();
    await expect(sidebar.getByText("Users")).toHaveCount(0);
    await expect(sidebar.getByText("Company settings")).toHaveCount(0);
  });

  test("a manager who opens an admin-only page is sent home", async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "manager@roma.dz");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/users");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("a kiosk account goes straight to the kiosk", async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "kiosk@roma.dz");
    await expect(page).toHaveURL(/\/kiosk$/);
  });

  test("a wrong password shows the server's reason and stays on sign-in", async ({ page }) => {
    await mockApi(page);
    await signInAs(page, "admin@roma.dz", "wrong");
    await expect(page.getByText("Wrong email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("a signed-out visitor is sent to sign in, then back to the page they wanted", async ({ page }) => {
    await mockApi(page);
    await page.goto("/reporting/monthly-payroll");
    await expect(page).toHaveURL(/\/signin\?.*next=%2Freporting%2Fmonthly-payroll/);
    await page.getByPlaceholder("you@example.com").fill("admin@roma.dz");
    await page.getByPlaceholder("Enter your password").fill("correct-horse");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/reporting\/monthly-payroll$/);
  });
});

test.describe("session renewal", () => {
  test("an access token about to expire is renewed and the user stays signed in", async ({ page }) => {
    const state = await mockApi(page);
    // A session saved by an earlier visit, whose access token expires in 10 s
    const expiring = jwt(10);
    state.validTokens.add(expiring);
    await page.addInitScript(
      ({ token, user, company }) => {
        localStorage.setItem("auth_token", token);
        localStorage.setItem("auth_refresh", "refresh-1");
        localStorage.setItem("auth_user", JSON.stringify(user));
        localStorage.setItem("auth_company", JSON.stringify(company));
      },
      { token: expiring, user: users["admin@roma.dz"], company }
    );
    await page.goto("/home");
    await expect(page).toHaveURL(/\/home$/);
    await expect.poll(() => state.refreshCalls).toBeGreaterThan(0);
    await expect(page.locator("aside").getByText("Reporting")).toBeVisible();
  });

  test("an ended session sends the user back to sign in", async ({ page }) => {
    await mockApi(page);
    await page.route(`${API}/auth/refresh`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"revoked"}' })
    );
    await page.addInitScript(
      ({ user, company }) => {
        localStorage.setItem("auth_token", "not-valid-anymore");
        localStorage.setItem("auth_refresh", "revoked");
        localStorage.setItem("auth_user", JSON.stringify(user));
        localStorage.setItem("auth_company", JSON.stringify(company));
      },
      { user: users["admin@roma.dz"], company }
    );
    await page.goto("/home");
    await expect(page).toHaveURL(/\/signin\?.*expired=1/);
  });
});
