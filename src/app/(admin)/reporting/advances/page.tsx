import type { Metadata } from "next";
import React from "react";
import AdvancesView from "@/components/reporting/AdvancesView";

export const metadata: Metadata = {
  title: "Advances | Nexo InOuty",
  description: "Salary advances given to employees.",
};

export default function AdvancesPage() {
  return <AdvancesView />;
}