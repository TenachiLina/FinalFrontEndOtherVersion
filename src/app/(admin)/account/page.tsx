import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ChangePasswordForm from "@/components/users/ChangePasswordForm";
import ProfileForm from "@/components/users/ProfileForm";
import MySessions from "@/components/sessions/MySessions";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "My account | Nexo InOuty",
};

export default function AccountPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="My account" />
      <ComponentCard title="Your profile">
        <ProfileForm />
      </ComponentCard>
      <div className="mt-6">
        <ComponentCard title="Change your password">
          <ChangePasswordForm />
        </ComponentCard>
      </div>
      <div className="mt-6">
        <ComponentCard title="Where you're signed in">
          <MySessions />
        </ComponentCard>
      </div>
    </div>
  );
}
