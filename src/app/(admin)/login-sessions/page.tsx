import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import LoginSessionsView from "@/components/sessions/LoginSessionsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login sessions | Nexo InOuty",
};

export default function LoginSessionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Login sessions" />
      <ComponentCard title="Login sessions">
        <LoginSessionsView />
      </ComponentCard>
    </div>
  );
}
