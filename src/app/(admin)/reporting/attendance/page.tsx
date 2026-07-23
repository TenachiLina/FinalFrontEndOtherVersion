import type { Metadata } from "next";
import React from "react";
import AttendanceView from "@/components/reporting/AttendanceView";

export const metadata: Metadata = {
  title: "Attendance | Nexo InOuty",
  description: "Lateness and absences across all employees.",
};

export default function AttendancePage() {
  return <AttendanceView />;
}