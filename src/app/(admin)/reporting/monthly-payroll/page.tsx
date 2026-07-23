import type { Metadata } from "next";
import React from "react";
import MonthlyPayrollView from "@/components/reporting/MonthlyPayrollView";

export const metadata: Metadata = {
  title: "Monthly Payroll | Nexo InOuty",
  description: "Net payout for every employee for the selected pay period.",
};

export default function MonthlyPayrollPage() {
  return <MonthlyPayrollView />;
}