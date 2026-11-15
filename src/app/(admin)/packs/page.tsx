import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PacksView from "@/components/billing/PacksView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Packs | Nexo InOuty",
};

export default function PacksPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Packs" />
      <ComponentCard title="Packs and prices">
        <PacksView />
      </ComponentCard>
    </div>
  );
}
