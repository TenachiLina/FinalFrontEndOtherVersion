// Draws payslips as an Excel workbook, cell for cell like FICHE DE PAIE.xlsx.
// Loaded only when someone exports: exceljs is large.

import ExcelJS from "exceljs";
import { Payslip, SOCIAL_SECURITY_RATE } from "@/lib/payslip";

const FONT = "Times New Roman";
const MONEY = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';
const THIN = { style: "thin" } as const;

type Sides = "l" | "r" | "t" | "b";

function borders(sides: string): Partial<ExcelJS.Borders> {
  const has = (s: Sides) => (sides.includes(s) ? THIN : undefined);
  return { left: has("l"), right: has("r"), top: has("t"), bottom: has("b") };
}

function put(
  sheet: ExcelJS.Worksheet,
  address: string,
  value: ExcelJS.CellValue,
  { size = 11, bold = true, align, border, numFmt }: {
    size?: number;
    bold?: boolean;
    align?: Partial<ExcelJS.Alignment>;
    border?: string;
    numFmt?: string;
  } = {}
) {
  const cell = sheet.getCell(address);
  if (value !== null) cell.value = value;
  cell.font = { name: FONT, size, bold };
  if (align) cell.alignment = align;
  if (border) cell.border = borders(border);
  if (numFmt) cell.numFmt = numFmt;
}

/** A boxed, merged cell such as "G11:H11". */
function box(
  sheet: ExcelJS.Worksheet,
  range: string,
  value: ExcelJS.CellValue,
  options: Parameters<typeof put>[3] = {}
) {
  const [first, last] = range.split(":");
  sheet.mergeCells(range);
  put(sheet, first, value, { ...options, border: "lrtb" });
  sheet.getCell(first).border = borders("lrtb");
  sheet.getCell(last).border = borders("lrtb");
}

/** "YYYY-MM-DD" as an Excel date (at UTC midnight, so the day can't shift). */
function excelDate(date: string): Date | string {
  const [y, m, d] = date.split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : date;
}

function drawPayslip(sheet: ExcelJS.Worksheet, p: Payslip) {
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    scale: 79,
    margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  [8.43, 16.86, 8.43, 11.86, 8.57, 20.14, 12.57, 13].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  const heights: Record<number, number> = { 1: 22.5, 3: 30, 5: 27, 7: 18.75, 44: 22.5 };
  Object.entries(heights).forEach(([row, height]) => {
    sheet.getRow(Number(row)).height = height;
  });

  // Company header
  const left = { horizontal: "left", vertical: "middle" } as const;
  [
    ["A1:H1", p.company.name, 18],
    ["A2:H2", p.company.activity, 11],
    ["A3:H3", p.company.address, 11],
    ["A4:H4", `N° Cotisant :  ${p.company.contributorNumber}`, 11],
  ].forEach(([range, value, size]) => {
    sheet.mergeCells(range as string);
    put(sheet, (range as string).split(":")[0], value as string, {
      size: size as number,
      align: { ...left, wrapText: true },
    });
  });

  // Title band
  sheet.mergeCells("A5:B5");
  sheet.mergeCells("E5:H5");
  put(sheet, "A5", "BULLETIN DE PAIE", { align: left });
  put(sheet, "E5", p.period, { align: left, numFmt: "@" });
  ["A5", "C5", "D5", "E5"].forEach((address) => {
    sheet.getCell(address).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF8EA9DB" },
    };
  });

  // Employee
  const center = { horizontal: "center", vertical: "middle" } as const;
  put(sheet, "D7", "NOM:", { size: 12, align: center });
  box(sheet, "E7:H7", p.employeeName, { size: 14, align: { horizontal: "center" } });
  put(sheet, "D9", "SIT. FAMILIALE:", { size: 12 });
  put(sheet, "F9", p.familyStatus, { size: 12, align: { horizontal: "center" }, border: "lrtb" });
  put(sheet, "F11", "DATE NAISSANCE", { size: 12 });
  box(sheet, "G11:H11", excelDate(p.birthDate), { size: 12, align: center, numFmt: "dd/mm/yyyy" });
  put(sheet, "A12", "FONCTION:", { size: 12 });
  box(sheet, "C12:D12", p.jobTitle, { size: 10, align: { vertical: "middle" } });
  put(sheet, "F12", "DATE ENT:", { size: 12 });
  box(sheet, "G12:H12", excelDate(p.hireDate), { size: 12, align: center, numFmt: "dd/mm/yyyy" });
  put(sheet, "F13", "N° SS:", { size: 12 });
  box(sheet, "G13:H13", p.socialSecurityNumber, { size: 12, align: center, numFmt: "@" });

  // Table header
  sheet.mergeCells("A18:D19");
  put(sheet, "A18", "LIBELLE", { size: 12, align: center, border: "lrtb" });
  ([["E", "N/BASE"], ["F", "TAUX"], ["G", "GAIN"], ["H", "RETENUE"]] as const).forEach(([col, label]) => {
    sheet.mergeCells(`${col}18:${col}19`);
    put(sheet, `${col}18`, label, { size: 12, align: center, border: "lrtb" });
  });

  // Table body: the same borders on every row, closed at the top and bottom
  for (let row = 20; row <= 40; row++) {
    const edge = row === 20 ? "t" : row === 40 ? "b" : "";
    const money = row === 20 || row === 40 ? undefined : MONEY;
    put(sheet, `A${row}`, null, { border: `l${edge}` });
    put(sheet, `B${row}`, null, { border: edge });
    put(sheet, `C${row}`, null, { border: edge });
    put(sheet, `D${row}`, null, { border: edge });
    put(sheet, `E${row}`, null, { border: `lr${edge}`, numFmt: money });
    put(sheet, `F${row}`, null, { border: `l${edge}`, numFmt: money });
    put(sheet, `G${row}`, null, { border: `lr${edge}`, numFmt: money });
    put(sheet, `H${row}`, null, { border: `r${edge}`, numFmt: money });
  }
  sheet.getCell("A21").value = "SALAIRE DE BASE";
  sheet.getCell("E21").value = p.days;
  sheet.getCell("G21").value = p.baseSalary;
  sheet.getCell("G21").alignment = center;
  sheet.getCell("A23").value = "SALAIRE DE POSTE";
  sheet.getCell("G23").value = { formula: "+G21/30*E21", result: p.postSalary };
  sheet.getCell("A25").value = "RETENUE SECU. SLE";
  sheet.getCell("F25").value = SOCIAL_SECURITY_RATE;
  sheet.getCell("F25").numFmt = "0%";
  sheet.getCell("F25").alignment = { horizontal: "center" };
  sheet.getCell("H25").value = { formula: `+G23*${SOCIAL_SECURITY_RATE}`, result: p.socialSecurity };
  sheet.getCell("A27").value = "PRIME DE TRANSPORT";
  sheet.getCell("A29").value = "PRIME DE PANIER";
  sheet.getCell("A31").value = "FRAIS DE MISSION";
  sheet.getCell("G31").value = 0;

  // Totals
  sheet.mergeCells("A41:F42");
  put(sheet, "A41", "TOTAL", {
    size: 12,
    align: { horizontal: "right", vertical: "middle", indent: 1 },
    border: "lrtb",
  });
  box(sheet, "G41:G42", { formula: "SUM(G23:G40)", result: p.postSalary }, { align: center, numFmt: MONEY });
  box(sheet, "H41:H42", { formula: "SUM(H21:H40)", result: p.socialSecurity }, { align: center, numFmt: MONEY });
  put(sheet, "E44", "NET A PAYER", { size: 14 });
  box(sheet, "G44:H44", { formula: "G41-H41", result: p.net }, {
    size: 18,
    align: { horizontal: "center" },
    numFmt: MONEY,
  });
}

// Sheet names: at most 31 characters, none of : \ / ? * [ ]
const sheetName = (p: Payslip) =>
  `${p.empNumber} ${p.employeeName}`.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim();

/** One worksheet per payslip. */
export function buildPayslipWorkbook(payslips: Payslip[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  payslips.forEach((p) => drawPayslip(workbook.addWorksheet(sheetName(p)), p));
  return workbook;
}

export async function downloadPayslips(payslips: Payslip[], fileName: string) {
  const buffer = await buildPayslipWorkbook(payslips).xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
