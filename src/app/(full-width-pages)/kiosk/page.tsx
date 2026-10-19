import KioskView from "@/components/kiosk/KioskView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clock in | Nexo InOuty",
};

export default function KioskPage() {
  return <KioskView />;
}
