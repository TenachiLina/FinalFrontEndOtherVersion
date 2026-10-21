"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { reportClientError } from "@/lib/reportError";

// Shown instead of a blank page when something on a page crashes.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page crashed", error);
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-50 text-2xl font-bold text-error-500 dark:bg-error-500/15">
        !
      </div>
      <h1 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
        {t("This page ran into a problem")}
      </h1>
      <p className="mb-6 max-w-md text-sm text-gray-500 dark:text-gray-400">
        {t("Your data is safe. Try again, and if it keeps happening, reload the page or go back to the previous page.")}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          {t("Try again")}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700"
        >
          {t("Reload page")}
        </button>
      </div>
    </div>
  );
}
