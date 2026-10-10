// → app/(admin)/reporting/bonuses/page.tsx  (replaces your current one; sends old links to the new page)
import { redirect } from "next/navigation";

export default function BonusesIndexPage() {
  redirect("/reporting/bonuses/give");
}