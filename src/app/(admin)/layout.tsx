"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canOpen, homePathFor } from "@/lib/auth";
import { getRememberedSlug } from "@/lib/branding";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { user, company, loading, switchCompany } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const forbidden = !!user && !canOpen(pathname, user, company);

  // Every page in this layout requires a login. Pages also need the right role
  // and the company's matching feature (see canOpen in lib/auth.ts).
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const slug = getRememberedSlug();
      const company = slug ? `company=${encodeURIComponent(slug)}&` : "";
      router.replace(`/signin?${company}next=${encodeURIComponent(pathname)}`);
    } else if (forbidden) {
      router.replace(homePathFor(user, company));
    }
  }, [loading, user, company, forbidden, pathname, router]);

  if (loading || !user || forbidden) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar />
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`flex-1 min-w-0 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* Header */}
        <AppHeader />
        {user.role === "superadmin" && company && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400 md:px-6">
            <span>
              You are working inside <strong>{company.name}</strong> as its admin.
            </span>
            <button
              type="button"
              className="font-medium underline"
              onClick={() => switchCompany(null)}
            >
              Back to all companies
            </button>
          </div>
        )}
        {/* Page Content */}
        {/* Fills the width next to the sidebar (no centred max width, which left a gap on wide screens) */}
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
