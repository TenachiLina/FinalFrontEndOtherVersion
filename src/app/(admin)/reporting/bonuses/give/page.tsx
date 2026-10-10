// → app/(admin)/reporting/bonuses/give/page.tsx
import type { Metadata } from "next";
import React from "react";
import BonusesGiveView from "@/components/reporting/BonusesGiveView";

export const metadata: Metadata = {
  title: "Give Primes | Nexo InOuty",
  description: "Give weekly or monthly primes to employees.",
};

export default function GiveBonusesPage() {
  return <BonusesGiveView />;
}