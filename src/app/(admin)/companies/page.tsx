import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CompaniesView from "@/components/companies/CompaniesView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Companies | Nexo InOuty",
};

export default function CompaniesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Companies" />
      <ComponentCard title="Customer companies">
        <CompaniesView />
      </ComponentCard>
    </div>
  );
}
