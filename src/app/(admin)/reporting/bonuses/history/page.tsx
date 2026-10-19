// → app/(admin)/reporting/bonuses/history/page.tsx
import type { Metadata } from "next";
import React from "react";
import BonusesHistoryView from "@/components/reporting/BonusesHistoryView";

export const metadata: Metadata = {
  title: "Bonus History | Nexo InOuty",
  description: "History of bonuses given to employees.",
};

export default function BonusesHistoryPage() {
  return <BonusesHistoryView />;
}