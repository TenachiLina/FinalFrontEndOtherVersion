import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ActivityLogView from "@/components/activity/ActivityLogView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity log | Nexo InOuty",
};

export default function ActivityLogPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Activity log" />
      <ComponentCard title="Activity log">
        <ActivityLogView />
      </ComponentCard>
    </div>
  );
}
