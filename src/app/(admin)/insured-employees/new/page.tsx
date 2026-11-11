import type { Metadata } from "next";
import React from "react";
import EmployeeDataForm from "@/app/(admin)/(others-pages)/addEmployeeForm/EmployeeDataForm";

export const metadata: Metadata = {
  title: "Add Insured Employee | Nexo InOuty",
};

export default function AddInsuredEmployeePage() {
  return <EmployeeDataForm insured />;
}
