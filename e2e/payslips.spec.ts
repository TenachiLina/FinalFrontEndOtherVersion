import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockApi, signInAs } from "./mock-api";

test("payslips: the slip and its Excel export use 30 days", async ({ page }, testInfo) => {
  await mockApi(page);
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/reporting/payslips");
  await page.emulateMedia({ colorScheme: "light" });

  // Karim: 41 600 DA for 30 days → 3 744 DA of social security
  await expect(page.getByRole("button", { name: "Karim Benali" })).toBeVisible();
  await expect(page.getByText("37 856,00").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("page.png"), fullPage: true });

  // N/BASE is always 30: nothing to type
  await expect(page.getByRole("spinbutton")).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export to Excel", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Fiche de paie BENALI KARIM .+\.xlsx$/);
  const file = testInfo.outputPath("slip.xlsx");
  await download.saveAs(file);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  expect(sheet.getCell("E7").value).toBe("BENALI KARIM");
  expect(sheet.getCell("E21").value).toBe(30);
  expect(sheet.getCell("G44").value).toMatchObject({ formula: "G41-H41", result: 37856 });

  // Printing shows the payslips only, one per page
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print all / PDF" }).click();
  await expect(page.locator("#payslip-print .payslip-sheet")).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Payslips" })).toBeHidden();
  await page.pdf({ path: testInfo.outputPath("slip.pdf"), printBackground: true, preferCSSPageSize: true });
});
