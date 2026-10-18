import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CompanySettingsForm from "@/components/companies/CompanySettingsForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company settings | Nexo InOuty",
};

export default function CompanySettingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Company settings" />
      <ComponentCard title="Company settings">
        <CompanySettingsForm />
      </ComponentCard>
    </div>
  );
}
