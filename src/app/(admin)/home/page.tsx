import HomeView from "@/components/home/HomeView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home | Nexo InOuty",
};

export default function HomePage() {
  return <HomeView />;
}
