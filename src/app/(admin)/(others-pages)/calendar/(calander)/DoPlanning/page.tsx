import Calendar from "@/components/calendar/NewPlanning";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "New planning | Nexo InOuty",
    // other metadata
};
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Planning" />
      <Calendar />
    </div>
  );
}
