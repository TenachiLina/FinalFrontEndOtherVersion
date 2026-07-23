import type { Metadata } from "next";
import React from "react";
import OverviewView from "@/components/reporting/OverviewView";

export const metadata: Metadata = {
  title: "Reporting Overview | Nexo InOuty",
  description: "Worktime, salary, and attendance overview.",
};

export default function Home() {
  return <OverviewView />;
}