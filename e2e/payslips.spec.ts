import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockApi, signInAs } from "./mock-api";

test("payslips: changing the days updates the slip and the Excel export", async ({ page }, testInfo) => {
  await mockApi(page);
  await signInAs(page, "admin@roma.dz");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/reporting/payslips");
  await page.emulateMedia({ colorScheme: "light" });

  // Karim: 41 600 DA for 30 days → 3 744 DA of social security
  await expect(page.getByRole("button", { name: "Karim Benali" })).toBeVisible();
  await expect(page.getByText("37 856,00").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("page.png"), fullPage: true });

  // 15 days → half the salary
  await page.getByRole("spinbutton", { name: "Days for Karim Benali" }).fill("15");
  await expect(page.getByText("18 928,00").first()).toBeVisible();

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
  expect(sheet.getCell("E21").value).toBe(15);
  expect(sheet.getCell("G44").value).toMatchObject({ formula: "G41-H41", result: 18928 });

  // Printing shows the payslips only, one per page
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole("button", { name: "Print all / PDF" }).click();
  await expect(page.locator("#payslip-print .payslip-sheet")).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: "Payslips" })).toBeHidden();
  await page.pdf({ path: testInfo.outputPath("slip.pdf"), printBackground: true, preferCSSPageSize: true });
});
