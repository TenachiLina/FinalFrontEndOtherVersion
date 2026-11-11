import type { Metadata } from "next";
import React from "react";
import PayslipsView from "@/components/reporting/PayslipsView";

export const metadata: Metadata = {
  title: "Payslips | Nexo InOuty",
  description: "Monthly payslips for every employee, ready to export.",
};

export default function PayslipsPage() {
  return <PayslipsView />;
}
