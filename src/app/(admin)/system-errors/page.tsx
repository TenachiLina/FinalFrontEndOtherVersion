import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SystemErrorsView from "@/components/system-errors/SystemErrorsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "System errors | Nexo InOuty",
};

export default function SystemErrorsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="System errors" />
      <ComponentCard title="System errors">
        <SystemErrorsView />
      </ComponentCard>
    </div>
  );
}
