import type { Metadata } from "next";
import React from "react";
import EmployeeDetailView from "@/components/reporting/EmployeeDetailView";

export const metadata: Metadata = {
  title: "Employee Report | Nexo InOuty",
  description: "Individual employee payroll and attendance detail.",
};

export default async function EmployeeReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EmployeeDetailView empId={id} />;
}