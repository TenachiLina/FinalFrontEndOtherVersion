import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MobileAppView from "@/components/mobile-app/MobileAppView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mobile app | Nexo InOuty",
};

export default function MobileAppPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Mobile app" />
      <ComponentCard title="The employee app">
        <MobileAppView />
      </ComponentCard>
    </div>
  );
}
