import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CorrectionsView from "@/components/corrections/CorrectionsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Correction requests | Nexo InOuty",
};

export default function CorrectionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Correction requests" />
      <ComponentCard title="Mistakes reported by employees">
        <CorrectionsView />
      </ComponentCard>
    </div>
  );
}
