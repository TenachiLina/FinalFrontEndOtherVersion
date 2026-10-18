import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import UsersView from "@/components/users/UsersView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users | Nexo InOuty",
};

export default function UsersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Users" />
      <ComponentCard title="App users">
        <UsersView />
      </ComponentCard>
    </div>
  );
}
