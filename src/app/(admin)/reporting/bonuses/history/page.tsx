// → app/(admin)/reporting/bonuses/history/page.tsx
import type { Metadata } from "next";
import React from "react";
import BonusesHistoryView from "@/components/reporting/BonusesHistoryView";

export const metadata: Metadata = {
  title: "Primes History | Nexo InOuty",
  description: "History of primes given to employees.",
};

export default function BonusesHistoryPage() {
  return <BonusesHistoryView />;
}