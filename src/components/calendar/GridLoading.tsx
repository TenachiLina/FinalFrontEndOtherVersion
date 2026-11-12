import { t } from "@/lib/i18n";

/** "Loading planning data..." shown at the top of a planning grid, above the table. */
export default function GridLoading() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500 dark:border-gray-600 dark:border-t-brand-400"
      />
      {t("Loading planning data...")}
    </div>
  );
}
