# Test Findings: View Planning and Shifts Management

Scope: `src/hooks/useViewPlanning.ts`, `src/hooks/ShiftsmanagmentHook.ts`,
`src/components/calendar/ViewPlanning.tsx`, `src/components/TaskRow/TaskRow.tsx`,
`calendar/(calander)/ShiftsManagment/page.tsx`, `calendar/(calander)/ViewPlanning/page.tsx`.

Each bug has an `it.fails(...)` test with a `// BUG-4NN` comment above it. The test describes the correct behaviour and fails today. Each one was checked by switching it to `it(` and reading the failure.

## Open issues

Sorted by severity.

### BUG-406: Backups saved by the planning editor never appear in View Planning
- **Severity:** High
- **Type:** Bug
- **Location:** `src/components/calendar/ViewPlanning.tsx` (cells, table-only mode and the list modal all read `emp.backupTitle` only)
- **Found by:** `ViewPlanning.test.tsx` › "shows the backups saved with the planning"
- **Steps / input:** A planning entry with `backupEmpIds: [Sara Kaci]` and no `backupEmpId`. This is what `useNewPlanning` saves today (`backupEmpIds: getBackupIds(cell)`).
- **Expected:** The cell shows "Ali Ben (Backup: Sara Kaci)".
- **Actual:** The cell shows only "Ali Ben". In table-only mode it says "Backup: No backup". The hook builds `cell.backups` correctly, but the component only shows `backupTitle`, which comes from the legacy `backupEmpId` field. `types.ts` says that field will be removed after the migration. Once it is, View Planning never shows a backup again.
- **Suggested fix:** Render `emp.backups` (all of them, joined by ", ") and use `backupTitle` only when `backups` is empty.
- **Status:** Open

### BUG-403: Deleting a shift that is still in use never asks to force the delete
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/hooks/ShiftsmanagmentHook.ts`, `confirmDelete`
- **Found by:** `ShiftsmanagmentHook.test.ts` › "shows how often a shift in use is planned, then forces the delete" and "counts 0 uses when a conflict gives no count". `ShiftsManagment/page.test.tsx` › "warns that a shift is still planned and deletes it on a second confirmation"
- **Steps / input:** Archived tab › Delete › Delete. The backend answers `409 {"message":"Shift in use","usageCount":3}`.
- **Expected:** The dialog stays open and says "This shift is used in 3 planning entries." A second Delete sends `DELETE /shifts/:id?force=true`.
- **Actual:** `String(e)` is `"Error: 409 {…}"`, so `message.startsWith("409")` is never true. The dialog closes and the page shows "Could not delete this shift. Error: 409 {"message":"Shift in use","usageCount":3}". A shift used in any planning can never be deleted, and the force path (plus the warning in the page) is dead code.
- **Suggested fix:** Test `e.message.startsWith("409")` (or throw an `ApiError` with `status` from `apiFetch` and check `err.status === 409`). Parse the body with `JSON.parse` instead of a regex.
- **Status:** Open

### BUG-405: A slow Active list replaces the Archived list after switching tabs
- **Severity:** Medium
- **Type:** Bug (race condition)
- **Location:** `src/hooks/ShiftsmanagmentHook.ts`, `fetchShifts`
- **Found by:** `ShiftsManagment/page.test.tsx` › "keeps showing the archived shifts when the active list answers late"
- **Steps / input:** Open the page and click "Archived" before `GET /shifts?status=active` has answered. The archived list arrives first.
- **Expected:** The Archived tab keeps showing the archived shifts.
- **Actual:** When the active answer arrives, it replaces the list. The Archived tab then shows active shifts with "Restore" and a permanent "Delete" button.
- **Suggested fix:** Ignore stale answers: keep a request counter or an `AbortController` in `fetchShifts`, or cancel it in the effect cleanup (`let cancelled = false; return () => { cancelled = true }`).
- **Status:** Open

### BUG-401: A slow answer for the previous day replaces the planning of the selected day
- **Severity:** Medium
- **Type:** Bug (race condition)
- **Location:** `src/hooks/useViewPlanning.ts`, `fetchPlanning` and the effect that calls it
- **Found by:** `useViewPlanning.test.ts` › "shows the selected day even when the previous day's answer arrives last"
- **Steps / input:** Today is 24 October. Press "next day" before `GET /planning` for the 24th has answered. The answer for the 25th arrives first.
- **Expected:** The grid shows the 25th's planning (Sara Kaci).
- **Actual:** The late answer is filtered with the 24th (from its closure) and replaces the grid. The page shows the 24th's planning (Ali Ben) while the 25th is selected. Clicking quickly through days on a slow connection shows the wrong day with no sign of it.
- **Suggested fix:** Cancel stale requests in the effect cleanup (an `AbortController` or an `ignore` flag), so only the latest date writes the grid.
- **Status:** Open

### BUG-402: In time zones ahead of Algeria, a picked day shows the previous day's planning
- **Severity:** Medium (only browsers ahead of UTC+1, e.g. France or Spain in summer)
- **Type:** Bug
- **Location:** `src/hooks/useViewPlanning.ts`, `fetchPlanning` (`currentDate.toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' })`)
- **Found by:** `useViewPlanning.test.ts` › "shows the picked day's planning for a manager in Paris in summer"
- **Steps / input:** Browser time zone `Europe/Paris`, 15 July 2026. Pick the 20th in the mini calendar, which runs `setCurrentDate(new Date(2026, 6, 20))`, local midnight.
- **Expected:** The planning of 20 July.
- **Actual:** Local midnight in Paris (UTC+2) is 23:00 on the 19th in Algiers, so the 19th's planning is shown. The day buttons hold local dates, but the filter converts them to Algiers time. The company `utcOffset` setting is also ignored.
- **Suggested fix:** Build the day key from the local calendar date (`getFullYear/getMonth/getDate`). Or store the selected day as a `"YYYY-MM-DD"` string instead of a `Date`. Better still, ask the backend for `/planning?planDate=YYYY-MM-DD`.
- **Status:** Open

### BUG-404: A failed shift delete shows the raw technical error
- **Severity:** Low
- **Type:** Bug (UX)
- **Location:** `src/hooks/ShiftsmanagmentHook.ts`, `confirmDelete` (`setError(t("Could not delete this shift.") + " " + message)`)
- **Found by:** `ShiftsManagment/page.test.tsx` › "explains a failed delete without technical details"
- **Steps / input:** Delete an archived shift. The backend answers `500 {"statusCode":500,"message":"Internal server error"}`.
- **Expected:** A friendly reason, as everywhere else ("Something went wrong on our side…"). `src/lib/errors.ts` says technical details are never shown.
- **Actual:** "Could not delete this shift. Error: 500 {"statusCode":500,"message":"Internal server error"}".
- **Suggested fix:** `setError(friendlyError(e, "Couldn't delete this shift"))`.
- **Status:** Open

### BUG-407: "Today" and the day arrows don't move the mini calendar, so the selected day can't be seen
- **Severity:** Low
- **Type:** Bug (UX)
- **Location:** `src/hooks/useViewPlanning.ts` (`goToToday`, `goPrev`, `goNext` only change `currentDate`); `ViewPlanning.tsx` (the `formattedDate` label is commented out)
- **Found by:** `ViewPlanning.test.tsx` › "brings the mini calendar back to today's month with the Today button"
- **Steps / input:** Go to November in the mini calendar, pick the 3rd, go on to December, then press "Today".
- **Expected:** The mini calendar goes back to October 2026 and highlights the 24th.
- **Actual:** The grid shows today's planning, but the mini calendar stays on December 2026. The date label is commented out, so nothing on screen shows which day is displayed. The same happens when the day arrows cross a month.
- **Suggested fix:** Also call `setCalendarMonth` in `goToToday`, `goPrev` and `goNext` (or derive the month from `currentDate`). Restore the date label.
- **Status:** Open

## Observations (not bugs, to confirm)

- **Weekly exports send a 0-based month.** The "Manager Export" and "Employees Export" requests send `month=9` for October, while "Export Day" sends `month=10`. The file names use `month + 1`. The comment says this is on purpose, but check that the backend really expects 0-based months there. Also, these endpoints export the *first week of the month*, whatever day is selected.
- **The whole planning is downloaded for every day change.** `GET /planning` is filtered in the browser, although `GET /planning?planDate=YYYY-MM-DD` exists (`shifts.api.ts`). This gets slower as history grows. It also causes BUG-401 and BUG-402.
- **Dead UI in View Planning:** the "Employee Details" modal (`isDetailsModalOpen` is never set to true). The "+ Add" placeholder in table-only mode does nothing. "No employees assigned" can't be reached, because empty cells can't be clicked. `useViewPlanning` imports `XLSX` and calls `useModal()`, but uses neither, and it `console.log`s the full planning on every load.
- **Accessibility:** the previous/next day arrows and the mini-calendar month arrows are icon-only buttons with no accessible name. The tests have to find them by position.
- **Untranslated text:** "N assigned employee(s)", "This shift is used in N planning entries.", "+ Add", the "Error: " prefix of the meta error, and the export menu items are not passed through `t()`.
- **"Try again" reloads the whole page** (`window.location.reload()`) after a planning load error. This loses the selected day and goes back to today. Calling `fetchPlanning` again would keep the day.
- **Shifts page:** when the list fails to load, "No shifts found." is shown under the error. An archive/restore error banner stays after a later successful action, until the tab changes.
- **Once BUG-403 is fixed:** a 409 without `usageCount` would show "used in 0 planning entries".

## Coverage

| File | Lines | Branches | Functions |
|------|-------|----------|-----------|
| `hooks/useViewPlanning.ts` | 100% | 100% | 100% |
| `hooks/ShiftsmanagmentHook.ts` | 98% | 77.4% | 93.8% |
| `components/calendar/ViewPlanning.tsx` | 100% | 97.1% | 100% |
| `components/TaskRow/TaskRow.tsx` | 100% | 100% | 100% |
| `ShiftsManagment/page.tsx` | 100% | 96.4% | 100% |
| `ViewPlanning/page.tsx` | 100% | 100% | 100% |

`ShiftsmanagmentHook.ts` branches stay below 80% because BUG-403 makes the 409 "shift in use" path (lines 184–185) unreachable. The page's usage warning (line 250) can't be reached for the same reason.
