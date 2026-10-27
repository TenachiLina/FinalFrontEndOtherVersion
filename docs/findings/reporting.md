# Test findings: reporting (overview, payroll, advances, bonuses, attendance)

Bugs found while testing the reporting hooks (`src/hooks/useReportingOverview.ts`, `useEmployeeReport.ts`, `useMonthlyPayrollList.ts`, `useWeeklyAdvancesList.ts`, `useAttendanceReport.ts`, `useBonusesList.ts`, `useBonusesHistory.ts`, `useAdvancesReport.ts`), the screens in `src/components/reporting/` and the pages under `src/app/(admin)/reporting/`. Each bug has a test marked `it.fails(...)` with a `// BUG-5NN` comment above it. The test describes the **correct** behaviour and currently fails.

All pay figures in the tests were worked out by hand with the company defaults: hourly rate = base / 8 / 26 (41 600 DA → 200 DA/h, 20 800 DA → 100 DA/h), weekly advance = (hours × rate − consumption) × 0.5, net = gross − penalties − consumption − advances (+ bonuses). They match what the screens show, apart from the bugs below.

Shared test helpers: `src/components/reporting/__testutils__/reportingApi.ts`.

## Open issues

Sorted by severity.

### BUG-503: The employee page sends a zero or negative weekly advance
- **Severity:** High
- **Type:** Bug (pay)
- **Location:** `src/hooks/useEmployeeReport.ts`, `giveAdvance`; button in `src/components/reporting/EmployeeDetailView.tsx` (`WeeklyAdvanceTab`)
- **Found by:** `useEmployeeReport.test.ts` › "never sends an advance of zero or less"
- **Steps / input:** Employee at 200 DA/h worked 8 h this week and consumed 2 000 DA. The offer is (1 600 − 2 000) × 0.5 = −200. Click "Give Advance" on their page.
- **Expected:** Nothing is sent, or a message says there is nothing to advance. The list page's modal already refuses amounts ≤ 0.
- **Actual:** `POST /advances { amount: -200 }`, toast "Advance given.", and the week shows "Advance given". At month end net = … − advances, so a −200 advance adds 200 DA to the take-home pay. A week without hours posts an advance of 0 and marks the week as given.
- **Suggested fix:** Return (with a message) when `weekAdvanceOffer <= 0`, and disable the button in that case.
- **Status:** Open

### BUG-502: When the planning can't be loaded, the payroll and weekly advances lists are empty
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/hooks/useMonthlyPayrollList.ts`, `src/hooks/useWeeklyAdvancesList.ts` (`.catch(optionalData(new Set(), "The planning"))` + `.filter(emp => scheduledIds.has(...))`)
- **Found by:** `useMonthlyPayrollList.test.ts` / `useWeeklyAdvancesList.test.ts` › "still lists the employees who worked when the planning can't be loaded"
- **Steps / input:** `GET /planning` answers 500; everything else loads.
- **Expected:** The employees who worked are still listed, with the warning.
- **Actual:** The fallback is an empty set, so the table says "No employees found" and "Total Net Payout 0.00 DA". The toast only says "totals may be incomplete".
- **Suggested fix:** When the planning failed, list every employee with worktime rows in the range, or show a load error.
- **Status:** Open

### BUG-506: Hours worked by an employee without a planning entry are left out of the payroll
- **Severity:** Medium (needs product confirmation)
- **Type:** Bug (pay)
- **Location:** `useMonthlyPayrollList.ts` and `useWeeklyAdvancesList.ts`, `.filter((emp) => scheduledIds.has(String(emp.emp_id)))`
- **Found by:** `useMonthlyPayrollList.test.ts` › "pays an employee who worked in the month even without a planning entry"
- **Steps / input:** Nadia (125 DA/h) has 8 h on 2026-03-12 but no planning entry in March.
- **Expected:** She is on the March payroll with gross 1 000 DA.
- **Actual:** She is not listed, so her hours are never paid or advanced. The Overview counts her, so its gross and the Monthly Payroll total disagree for the same month.
- **Suggested fix:** List employees who are scheduled **or** have worktime rows in the range.
- **Status:** Open

### BUG-504: A double click on "Give Advance" gives the advance twice
- **Severity:** Medium
- **Type:** Bug (pay)
- **Location:** `EmployeeDetailView.tsx` (`WeeklyAdvanceTab` button), `useEmployeeReport.ts` `giveAdvance`
- **Found by:** `EmployeeDetailView.test.tsx` › "gives the advance only once on a double click"
- **Steps / input:** Click "Give Advance" twice before the server answers.
- **Expected:** One `POST /advances`.
- **Actual:** Two POSTs. The button is only disabled while the existing advance is being checked, not while one is being saved. Both are deducted at month end.
- **Suggested fix:** A `saving` flag in `giveAdvance` that ignores repeat calls and disables the button.
- **Status:** Open

### BUG-501: A slow answer for a previous range replaces the range chosen last
- **Severity:** Medium
- **Type:** Bug
- **Location:** `load` in `useReportingOverview.ts`, `useMonthlyPayrollList.ts`, `useWeeklyAdvancesList.ts`, `useBonusesHistory.ts` (`useEmployeeReport.ts` already guards with a request id)
- **Found by:** `useReportingOverview.test.ts` › "shows the last range chosen when an earlier request answers late", and the same-named tests in `useMonthlyPayrollList.test.ts`, `useWeeklyAdvancesList.test.ts` and `useBonuses.test.ts`
- **Steps / input:** Pick February, then March before February has loaded; February answers last.
- **Expected:** March is shown.
- **Actual:** February's data and range are applied last, so the payroll shows the wrong month's net pay.
- **Suggested fix:** `const reqId = ++req.current`; ignore the answer when `reqId !== req.current`, as `useEmployeeReport` does.
- **Status:** Open

### BUG-515: The attendance page loads two different weeks on open, and the slower one wins
- **Severity:** Medium
- **Type:** Bug
- **Location:** `useAttendanceReport.ts` (mount effect loads `getLastWeekRange()`), `AttendanceView.tsx` (mount effect applies `getThisWeekRange()`)
- **Found by:** `AttendanceView.test.tsx` › "shows the week displayed in the picker even when the other request answers last"
- **Steps / input:** Open `/reporting/attendance` on Wed 2026-03-11. Requests go out for 03-05..03-11 (hook) and 03-09..03-15 (page); the first answers last.
- **Expected:** The table matches the picker (this week: 15 late minutes).
- **Actual:** The table shows 03-05..03-11 (55 late minutes) while the picker says 9–15 March. Which one wins depends on timing.
- **Suggested fix:** Let the page pass its initial range to the hook, with no load in the hook's mount effect, and guard `fetchReport` with a request id.
- **Status:** Open

### BUG-507: West of UTC, picked weeks start a day early or last 6 days
- **Severity:** Medium (only for companies west of UTC)
- **Type:** Bug
- **Location:** `useAttendanceReport.ts` `computeRange` (`new Date(selectedDate)`), `RangePicker.tsx` `previewRange` (`new Date(weekStart)`), `EmployeeDetailView.tsx` `handleWeekChange` (`new Date(start)`)
- **Found by:** `useAttendanceReport.test.ts` › "starts the week on the chosen day in a time zone behind UTC"; `RangePicker.test.tsx` › "ends the week 6 days later in a time zone behind UTC"; `EmployeeDetailView.test.tsx` › "ends the picked week 6 days later in a time zone behind UTC"
- **Steps / input:** TZ `America/New_York`. Weekly Advances: week starting 2026-03-09 → Apply. Employee page: pick 16 March. Open Attendance.
- **Expected:** 03-09..03-15, 03-16..03-22, 03-05..03-11.
- **Actual:** 03-09..03-14 and 03-16..03-21 (the last day of the week is never paid or advanced), and 03-04..03-10. Same root cause as BUG-001 (`generateDateRange`, also used by the Overview trend).
- **Suggested fix:** Parse with `new Date(\`${d}T00:00:00\`)`, as `DateInput` and `formatPretty` already do.
- **Status:** Open

### BUG-508: Advances and bonuses are deleted with one click, without confirmation
- **Severity:** Medium
- **Type:** UX / data loss
- **Location:** `AdvancesView.tsx` ("Revoke"), `BonusesHistoryView.tsx` ("Revoke"), `WeeklyAdvancesView.tsx` ("Undo")
- **Found by:** `AdvancesView.test.tsx` / `BonusesViews.test.tsx` › "asks for confirmation before revoking"; `WeeklyAdvancesView.test.tsx` › "asks for confirmation before undoing an advance"
- **Steps / input:** Click "Revoke" next to an advance or bonus.
- **Expected:** A `confirmDialog({ danger: true })`, as every other delete in the app uses, and nothing deleted until it is confirmed.
- **Actual:** The `DELETE` is sent at once. A stray click removes a deduction from the payroll.
- **Suggested fix:** `if (!(await confirmDialog({ title: "Revoke this advance?", danger: true }))) return;`
- **Status:** Open

### BUG-513: Typing a week start on the employee page scrambles the date
- **Severity:** Medium
- **Type:** Bug
- **Location:** `EmployeeDetailView.tsx`, `WeeklyAdvanceTab`: `onChange` calls `handleWeekChange` on every keystroke, and an effect copies `week.range.start` back into the field
- **Found by:** `EmployeeDetailView.test.tsx` › "loads the week whose start date is typed"
- **Steps / input:** Clear "Week starting" and type `2026-03-16`.
- **Expected:** The field keeps `2026-03-16` and week 03-16 → 03-22 loads.
- **Actual:** One `/worktime` request per keystroke (`..NaN-NaN-NaN`, `2..2001-02-07`, `206..206-01-07`…). Answers overwrite the field mid-typing, which ends as `2060-6` ("2060-6 → 2060-06-07"). Picking from the calendar works.
- **Suggested fix:** Only load complete valid dates (`/^\d{4}-\d{2}-\d{2}$/`), and don't overwrite the field while it is being edited.
- **Status:** Open

### BUG-505: A failed "Undo" on the employee page is silent
- **Severity:** Low
- **Type:** UX
- **Location:** `useEmployeeReport.ts`, `revokeAdvance`
- **Found by:** `useEmployeeReport.test.ts` › "tells the user when the revoke fails"
- **Expected:** An error toast, as on the Weekly Advances list.
- **Actual:** The status flips back to "Advance given" with no message; the error only goes to the console.
- **Suggested fix:** `toast.error(friendlyError(err, "Couldn't remove the advance"))`.
- **Status:** Open

### BUG-509: Total hours show floating-point noise
- **Severity:** Low
- **Type:** Bug (display)
- **Location:** `WeeklyAdvancesView.tsx`, `MonthlyPayrollView.tsx` totals row `{colTotals.hours} h`
- **Found by:** `WeeklyAdvancesView.test.tsx` / `MonthlyPayrollView.test.tsx` › "shows the total hours rounded"
- **Steps / input:** 0.1 h (`00:06:00`) + 0.2 h (`00:12:00`).
- **Expected:** `0.3 h`
- **Actual:** `0.30000000000000004 h`.
- **Suggested fix:** `{Number(colTotals.hours.toFixed(2))} h`.
- **Status:** Open

### BUG-510: The month picker ignores the month being shown
- **Severity:** Low
- **Type:** UX
- **Location:** `RangePicker.tsx` (`year`/`month` state start from `new Date()`, not `range`)
- **Found by:** `RangePicker.test.tsx` › "starts on the month it was opened on"
- **Steps / input:** Monthly Payroll opened on January (e.g. "Back to Monthly Payroll") while today is in March.
- **Expected:** The picker shows January 2026.
- **Actual:** It shows March 2026; Apply jumps to March.
- **Suggested fix:** Initialise `year`/`month` from `range.start`.
- **Status:** Open

### BUG-511: The bonus totals row mixes filtered and unfiltered figures
- **Severity:** Low
- **Type:** Bug (display)
- **Location:** `BonusesGiveView.tsx` totals row (`totalCount` from the filtered rows, `totalGiven` from all bonuses)
- **Found by:** `BonusesViews.test.tsx` › "totals only the employees listed"
- **Steps / input:** Search "amine" (2 bonuses, 350.50 DA) while Sara has 500 DA.
- **Expected:** `Total | 2 | 350.50 DA`
- **Actual:** `Total | 2 | 850.50 DA`. It also includes employees who are no longer listed.
- **Suggested fix:** Sum `employeeRows[].total` for the row.
- **Status:** Open

### BUG-512: The Overview shows a rise as a fall when the previous value was negative
- **Severity:** Low
- **Type:** Bug
- **Location:** `OverviewView.tsx`, `pctChange`
- **Found by:** `OverviewView.test.tsx` › "shows a rise in net payroll as a rise when the previous net was negative"
- **Steps / input:** Previous net −400 DA (1 600 − 500 − 1 500), current 2 600 DA.
- **Expected:** ▲
- **Actual:** "▼ 750.0%" in red.
- **Suggested fix:** Divide by `Math.abs(prev)`.
- **Status:** Open

### BUG-514: The employee page shows "0" in the Absent column for days worked
- **Severity:** Low
- **Type:** Bug (display)
- **Location:** `EmployeeDetailView.tsx`, `DayTable` (`{r.absent && r.absent_comment && …}`)
- **Found by:** `EmployeeDetailView.test.tsx` › "leaves the Absent column empty on days worked"
- **Expected:** An empty cell.
- **Actual:** `0`. React renders `0 && …` as "0".
- **Suggested fix:** `{r.absent ? … : null}`.
- **Status:** Open

## Observations (not bugs, to confirm)
- **Advances and bonuses are counted by date only.** Unlike `/worktime`, the client doesn't drop advances or bonuses outside `?start&end`. If the backend ignored those parameters, all advances would be deducted each month.
- **"Advance given for this week" means any advance dated in that week**, including manual ones. The offer doesn't subtract it, and the Weekly Advances list keeps only the last advance per employee, so "Undo" removes one of two.
- **The date of a weekly advance depends on the page.** The employee page dates it on the week's first day; the list modal uses today, clamped to the week. For a week spanning two months, the deduction lands in a different month depending on the page.
- **`emp_id` type differs between pages.** The employee page posts it as a string (`"101"`); the list page posts a number.
- **The Overview error has no reason.** The hook sets "Failed to load the overview." without `friendlyError`.
- **The "Where the Payroll Goes" donut leaves bonuses out.**
- **Range pickers accept empty or reversed ranges** (similar to BUG-004). On the Overview, an empty start sends `NaN-NaN-NaN` for the previous period.
- **Untranslated text:** "Pay period:", "✓ Advance given for this week", "Yes", "Employee #…", the back-link labels, "This month:", "Total (n)", "n / m given".
- **Form labels aren't linked to their fields** (`<label>` without `htmlFor` in the pickers, the modals and the Advances search).
- **The employee page's Monthly Payroll tab has no month picker.** Attendance "month" mode is 30 days, not a calendar month. The Advances page loads every advance ever given and filters in the browser.
