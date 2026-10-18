import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ChangePasswordForm from "@/components/users/ChangePasswordForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Change password | Nexo InOuty",
};

export default function AccountPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Change password" />
      <ComponentCard title="Change your password">
        <ChangePasswordForm />
      </ComponentCard>
    </div>
  );
}
