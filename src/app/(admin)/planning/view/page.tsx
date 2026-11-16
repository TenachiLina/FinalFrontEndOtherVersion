import ViewPlanning from "@/components/calendar/ViewPlanning";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Planning | Nexo InOuty",
    // other metadata
};
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Planning" />
      <ViewPlanning />
    </div>
  );
}
