import HelpView from "@/components/help/HelpView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & guides | Nexo InOuty",
};

export default function HelpPage() {
  return <HelpView />;
}
