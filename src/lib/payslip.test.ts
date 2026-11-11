import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildPayslip, formatPayslipDate, missingPayslipFields, payslipPeriod } from "./payslip";
import { buildPayslipWorkbook } from "./payslipExcel";

const company = {
  name: "SARL TEST",
  settings: {
    payslipActivity: "RESTAURATION RAPIDE",
    payslipAddress: "1 RUE TEST\nCONSTANTINE",
    payslipContributorNumber: "123",
  },
};

const employee = {
  empNumber: 101,
  firstName: "Ali",
  lastName: "Zerrouki",
  baseSalary: 24000,
  jobTitle: "AGENT DE CUISINE",
  familyStatus: "C",
  birthDate: "2004-03-14",
  hireDate: "2025-11-04",
  socialSecurityNumber: "000000000000",
};

describe("buildPayslip", () => {
  it("gives the amounts of FICHE DE PAIE.xlsx for 30 days", () => {
    const p = buildPayslip(employee, company, "2026-05");
    expect(p).toMatchObject({ period: "MAI 2026", days: 30, postSalary: 24000, socialSecurity: 2160, net: 21840 });
    expect(p.employeeName).toBe("ZERROUKI ALI");
  });

  it("uses the declared salary when one is set", () => {
    expect(buildPayslip({ ...employee, declaredSalary: 20000 }, company, "2026-05")).toMatchObject({
      days: 30,
      baseSalary: 20000,
      postSalary: 20000,
      socialSecurity: 1800,
      net: 18200,
    });
    // Removed from insured employees: back to the base salary
    expect(buildPayslip({ ...employee, declaredSalary: null }, company, "2026-05").baseSalary).toBe(24000);
  });

  it("rounds to the cent", () => {
    const p = buildPayslip({ ...employee, baseSalary: 25000.55 }, company, "2026-05");
    expect(p).toMatchObject({ postSalary: 25000.55, socialSecurity: 2250.05, net: 22750.5 });
  });

  it("lists what is still missing", () => {
    const p = buildPayslip({ empNumber: 1, firstName: "A", lastName: "B", baseSalary: 1 }, { name: "X" }, "2026-05");
    expect(missingPayslipFields(p)).toEqual([
      "Family status", "Job title", "Date of birth", "Hire date", "Insurance number",
      "Company activity", "Company address", "Contributor number",
    ]);
    expect(missingPayslipFields(buildPayslip(employee, company, "2026-05"))).toEqual([]);
  });
});

describe("period and dates", () => {
  it("writes months in French capitals", () => {
    expect(payslipPeriod("2026-02")).toBe("FÉVRIER 2026");
    expect(payslipPeriod("2026-12")).toBe("DÉCEMBRE 2026");
  });

  it("formats dates day first", () => {
    expect(formatPayslipDate("2004-03-14")).toBe("14/03/2004");
    expect(formatPayslipDate("")).toBe("");
  });
});

describe("buildPayslipWorkbook", () => {
  const reread = async () => {
    const p = buildPayslip(employee, company, "2026-05");
    const file = await buildPayslipWorkbook([p, { ...p, empNumber: 102 }]).xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    return workbook;
  };

  it("makes one sheet per payslip", async () => {
    expect((await reread()).worksheets.map((s) => s.name)).toEqual(["101 ZERROUKI ALI", "102 ZERROUKI ALI"]);
  });

  it("puts each value in the file's cell and keeps its formulas", async () => {
    const s = (await reread()).worksheets[0];
    expect(s.getCell("A1").value).toBe("SARL TEST");
    expect(s.getCell("A4").value).toBe("N° Cotisant :  123");
    expect(s.getCell("E5").value).toBe("MAI 2026");
    expect(s.getCell("E7").value).toBe("ZERROUKI ALI");
    expect(s.getCell("F9").value).toBe("C");
    expect(s.getCell("C12").value).toBe("AGENT DE CUISINE");
    expect(s.getCell("G11").value).toEqual(new Date(Date.UTC(2004, 2, 14)));
    expect(s.getCell("G13").value).toBe("000000000000");
    expect(s.getCell("E21").value).toBe(30);
    expect(s.getCell("G21").value).toBe(24000);
    expect(s.getCell("G23").value).toMatchObject({ formula: "+G21/30*E21", result: 24000 });
    expect(s.getCell("H25").value).toMatchObject({ formula: "+G23*0.09", result: 2160 });
    expect(s.getCell("G41").value).toMatchObject({ formula: "SUM(G23:G40)", result: 24000 });
    expect(s.getCell("H41").value).toMatchObject({ formula: "SUM(H21:H40)", result: 2160 });
    expect(s.getCell("G44").value).toMatchObject({ formula: "G41-H41", result: 21840 });
  });

  it("leaves the primes empty", async () => {
    const s = (await reread()).worksheets[0];
    expect(s.getCell("A27").value).toBe("PRIME DE TRANSPORT");
    expect(s.getCell("G27").value).toBeNull();
    expect(s.getCell("G29").value).toBeNull();
  });
});
