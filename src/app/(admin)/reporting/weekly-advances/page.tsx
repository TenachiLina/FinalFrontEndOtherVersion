import type { Metadata } from "next";
import React from "react";
import WeeklyAdvancesView from "@/components/reporting/WeeklyAdvancesView";

export const metadata: Metadata = {
  title: "Weekly Advances | Nexo InOuty",
  description: "Review and give salary advances across all employees.",
};

export default function WeeklyAdvancesPage() {
  return <WeeklyAdvancesView />;
}