import type { Metadata } from "next";
import React from "react";
import InsuredEmployeesView from "@/components/employees/InsuredEmployeesView";

export const metadata: Metadata = {
  title: "Insured Employees | Nexo InOuty",
  description: "Employees declared to social security, with their declared salary and insurance number.",
};

export default function InsuredEmployeesPage() {
  return <InsuredEmployeesView />;
}
