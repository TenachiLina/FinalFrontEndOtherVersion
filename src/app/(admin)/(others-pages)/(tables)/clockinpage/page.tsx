import ClockInPage from "@/components/tables/ClockInPage";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clock In / Out",
};

export default function ClockInPageRoute() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Clock In / Out" />
      <div className="space-y-6">
        <ClockInPage />
      </div>
    </div>
  );
}