import ClockInPage from "@/components/tables/ClockInFaceRecognitionPage";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Clock In / Out",
};

export default function ClockInPageRoute() {
  return (
    <div>
      <PageBreadcrumb pageTitle="" />
      <div className="space-y-6">
        <ClockInPage />
      </div>
    </div>
  );
}