import { expect, test } from "@playwright/test";
import { mockApi, signInAs } from "./mock-api";

const today = () => {
  // The browser runs in Africa/Algiers (playwright.config.ts)
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(new Date());
  return parts; // YYYY-MM-DD
};

test("kiosk: an employee clocks in, then out", async ({ page }) => {
  const state = await mockApi(page);
  await signInAs(page, "kiosk@roma.dz");
  await expect(page).toHaveURL(/\/kiosk$/);

  await page.getByPlaceholder("Find your name or number…").fill("karim");
  await page.getByText("Karim Benali").click();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(page.getByText("Clocked in", { exact: true })).toBeVisible();
  expect(state.kioskClockedIn.has(101)).toBe(true);
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByText("Karim Benali").click();
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await expect(page.getByText("Clocked out", { exact: true })).toBeVisible();
  expect(state.kioskClockedIn.has(101)).toBe(false);
});

test("monthly payroll shows each employee's net pay for the month", async ({ page }) => {
  const day = today();
  await mockApi(page, {
    // Karim: 41 600 DA/month → 200 DA/h. 8 h worked, 300 DA penalty, 500 DA consumption.
    worktime: [{ emp_id: 101, work_date: day, work_hours: "08:00:00", penalty: 300, consommation: 500 }],
    // Only scheduled employees are on the payroll (see BUG-506)
    planning: { [day]: [{ shiftId: "s1", empId: "e1", backupEmpIds: [], taskId: 1, tasks: [] }] },
  });
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/reporting/monthly-payroll");

  const karim = page.getByRole("row", { name: /Karim/ });
  await expect(karim).toBeVisible();
  // gross 8 × 200 = 1 600; net = 1 600 − 300 − 500 = 800
  await expect(karim).toContainText("1600.00");
  await expect(karim).toContainText("800.00");
  await expect(page.getByRole("row", { name: /Sara/ })).toHaveCount(0);
});

test("planning: an assignment saved for today is there after a reload, once", async ({ page }) => {
  const state = await mockApi(page);
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/calendar/DoPlanning");

  // Pizzaiolo × morning shift (08:00–16:00)
  const cell = page.getByRole("row", { name: /Pizzaiolo/ }).getByRole("cell").nth(1);
  await cell.click();
  await page.getByPlaceholder("Type a name or employee number…").fill("karim");
  await page.getByText("Karim Benali").click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(cell).toContainText("Karim Benali");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => state.bulkSaves).toBe(1);
  expect(state.planning[today()]).toHaveLength(1);

  await page.reload();
  const reloaded = page.getByRole("row", { name: /Pizzaiolo/ }).getByRole("cell").nth(1);
  await expect(reloaded).toContainText("Karim Benali");
  await expect(reloaded.getByText("Karim Benali")).toHaveCount(1);
});

test("language: Arabic switches the page to right-to-left and is remembered", async ({ page }) => {
  await mockApi(page);
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("option", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // No horizontal scroll in right-to-left
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
