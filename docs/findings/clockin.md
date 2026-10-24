# Test findings: clock-in pages and the employees list

Bugs found while testing `src/components/tables/ClockInPage.tsx` (Clock In / Out),
`src/components/tables/ClockInPageHistory.tsx` (clock-in history from the machine),
`src/components/tables/BasicTableOne.tsx` (employees list) and the pages that host them
(`src/app/(admin)/(others-pages)/(tables)/{clockinpage,clockinpagehistory,basic-tables}/page.tsx`).
Each bug has a test marked `it.fails(...)` with a `// BUG-2NN` comment above it. The test describes the
**correct** behaviour and currently fails.

All times below are Algeria time (UTC+1, the tests run with `TZ=Africa/Algiers`) unless marked "Z".

## Open issues

Sorted by severity.

### BUG-218: The history page counts lateness and overtime from midnight
- **Severity:** High
- **Type:** Bug (payroll)
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `addPunch` and `saveEditedPunch` (`shift.start_time` / `shift.end_time`)
- **Found by:** `ClockInPageHistory.test.tsx` › "measures the delay from the shift start sent by the API"
- **Steps / input:** `GET /shifts` returns `{ _id: "s1", startTime: "08:00", endTime: "16:00" }` (the `ShiftRecord` shape in `calendar/types.ts`, also read by `ClockInPage`). The employee is planned on it. Add a clock-in at 08:10 on the history page.
- **Expected:** `late_minutes: "10"`.
- **Actual:** `late_minutes: "490"`. The page reads `start_time`/`end_time`, which don't exist, so both fall back to `"00:00"`: every clock-in is "late" by its time of day and every clock-out is overtime from midnight (editing 08:00→16:30 saves late 540 min, overtime 990 min, and the success toast says so).
- **Suggested fix:** Read `shift.startTime ?? shift.start_time` and `shift.endTime ?? shift.end_time` (or reuse the mapping in `ClockInPage`).
- **Status:** Open

### BUG-221: Editing a punch shows its UTC time, and saving it moves the punch an hour
- **Severity:** High
- **Type:** Data-loss
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, the `onDoubleClick` handlers (`rawLog.timestamp.substring(11, 16)`)
- **Found by:** `ClockInPageHistory.test.tsx` › "opens the editor on the time shown in the table"
- **Steps / input:** A punch `2026-03-09T07:00:00.000Z`, shown as 08:00. Double-click it.
- **Expected:** The editor opens on 08:00.
- **Actual:** It opens on 07:00, the UTC time. Clicking ✓ without changing anything saves `new Date("2026-03-09T07:00:00")` local = 06:00Z, so the punch moves one hour earlier and the day's hours, delay and overtime are recalculated from the wrong time.
- **Suggested fix:** Pre-fill with `formatTime(rawLog.timestamp)` (the Algiers time the table shows), and build the new timestamp in the same time zone.
- **Status:** Open

### BUG-217: Adding a punch on the history page wipes the day's penalty, consumption and bonus
- **Severity:** High
- **Type:** Data-loss (payroll)
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `addPunch` (`worktimePayload`)
- **Found by:** `ClockInPageHistory.test.tsx` › "keeps the day's penalty and consumption when a punch is added"
- **Steps / input:** The day's worktime has `penalty: 500, consomation: 300`. Add the clock-out punch with the form left at its defaults (0).
- **Expected:** The penalty and consumption stay 500 and 300.
- **Actual:** Both are overwritten with 0 (and `bonus` too). `saveEditedPunch` explicitly keeps these fields from the existing worktime; `addPunch` always sends the form's values.
- **Suggested fix:** Read the existing worktime as `saveEditedPunch` does and only send the form's values when they were filled in (or add them to the existing ones).
- **Status:** Open

### BUG-209: Clocking in on a second shift overwrites the first shift's record
- **Severity:** High
- **Type:** Data-loss
- **Location:** `src/components/tables/ClockInPage.tsx`, `scheduleSave` → `upsertWorktime` (`worktime.api.ts`)
- **Found by:** `ClockInPage.test.tsx` › "keeps a separate record for each shift of the day"
- **Steps / input:** Ali is planned on 08:00–16:00 and 17:00–23:00. His morning record `w1` (shift `s1`, 08:00–12:00) is saved. At 17:00 he clocks in on the evening tab.
- **Expected:** A new record for shift `s2` (`POST /worktime`); `w1` is unchanged.
- **Actual:** The page keeps one entry per employee **and shift**, but the evening entry has no id yet, so `upsertWorktime` searches by `emp_id` + `work_date` only, finds `w1` and `PUT`s over it: `w1` becomes shift `s2`, clock-in 17:00. The morning hours are lost. This happens even when the backend filters correctly; with BUG-015 (backend ignoring the filters) any employee's record can be hit. So this page makes BUG-015 worse rather than working around it.
- **Suggested fix:** Include `shift_id` in the search (and check it on the result) when the caller works per shift, or pass the known id of the shift's record.
- **Status:** Open

### BUG-206: Leaving early on a shift that ends after midnight counts ~21 hours of overtime
- **Severity:** High
- **Type:** Bug (payroll)
- **Location:** `src/components/tables/ClockInPage.tsx`, `calcOvertime` (used for the table and for the saved `overtime_minutes`)
- **Found by:** `ClockInPage.test.tsx` › "gives no overtime for leaving early on a shift that ends after midnight"
- **Steps / input:** Shift 18:00–02:00, clock-in 18:00, clock-out 23:00.
- **Expected:** Overtime 00:00.
- **Actual:** Overtime 21:00 (1260 minutes). Only a shift ending exactly at 00:00 is treated as overnight; for 02:00 the clock-out 23:00 is compared with 02:00 of the same day.
- **Suggested fix:** Treat the shift as overnight when `end < start` and add 1440 to the end, and to a clock-out earlier than the start.
- **Status:** Open

### BUG-219: Worked hours run from the first to the last punch, so breaks are paid
- **Severity:** Medium (High if breaks are unpaid)
- **Type:** Bug (payroll)
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `addPunch` and `saveEditedPunch` ("CALCULATE WORK HOURS")
- **Found by:** `ClockInPageHistory.test.tsx` › "doesn't count a break between two periods as worked time"
- **Steps / input:** Punches 17:00, 18:00, 18:10 and 19:10 (the example in the comment on `upsertWorktime` in `worktime.api.ts`).
- **Expected:** `work_hours: "02:00"`, as that comment says ("17:00 -> 18:00, 18:10 -> 19:10 becomes … work_hours = 02:00").
- **Actual:** `work_hours: "02:10"`: last punch minus first punch, break included. The table itself pairs the punches into periods, so the data to sum them is there.
- **Suggested fix:** Sum the paired periods (`sorted[i]` → `sorted[i+1]`) instead of last − first.
- **Status:** Open

### BUG-208: The delay saved to the server isn't the one the page shows
- **Severity:** Medium
- **Type:** Bug (payroll)
- **Location:** `src/components/tables/ClockInPage.tsx`, `scheduleSave` (`entryToPayload` gets the shift times) vs. the row render (`specialTimes`)
- **Found by:** `ClockInPage.test.tsx` › "saves the same delay as the one shown"
- **Steps / input:** Shift 08:00–16:00, planning task for Ali 10:00–14:00. He clocks in at 10:05.
- **Expected:** The page shows Delay 00:05 and saves `late_minutes: "5"`.
- **Actual:** It shows 00:05 but saves `"125"` (measured from 08:00). Overtime has the same split (shown against the task end, saved against the shift end).
- **Suggested fix:** Use the same effective start/end (task times when present) in `scheduleSave`/`confirmAbsence` as in the render.
- **Status:** Open

### BUG-207: Arriving after midnight on a night shift isn't counted as late
- **Severity:** Medium
- **Type:** Bug (payroll)
- **Location:** `src/components/tables/ClockInPage.tsx`, `calcLate`
- **Found by:** `ClockInPage.test.tsx` › "counts the delay of a clock-in after midnight on a night shift"
- **Steps / input:** Shift 22:00–06:00, clock-in 00:30.
- **Expected:** Delay 02:30.
- **Actual:** 00:00 (`30 − 1320` is negative, so 0).
- **Suggested fix:** For an overnight shift, add 1440 to a clock-in earlier than the start when it is before the shift's end.
- **Status:** Open

### BUG-210: "Reset" only clears the screen; the times come back on reload
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPage.tsx`, `clearAllData`
- **Found by:** `ClockInPage.test.tsx` › "doesn't bring the times back after a reset and a reload"
- **Steps / input:** Ali's 08:00 clock-in is saved. Click Reset, confirm "All clock-in and clock-out times entered on this page today will be cleared.", reload.
- **Expected:** The times stay cleared.
- **Actual:** No request is sent, and the cleared rows even show "✓ Saved". On reload the server's 08:00 is back. Payroll uses the server's copy, so the reset never happened.
- **Suggested fix:** Save the cleared entries (or delete the records) after confirmation, and mark them unsaved until that succeeds.
- **Status:** Open

### BUG-211: After changing the date, the new day's times are stored under the first day
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPage.tsx`, `updateEntry` (`saveEntriesToStorage(currentDate, …)`)
- **Found by:** `ClockInPage.test.tsx` › "doesn't show another day's clock-ins after a reload"
- **Steps / input:** Open the page on March 2, pick March 3, clock Ali in (08:05), reload (back on March 2).
- **Expected:** March 2 shows Ali as not clocked in.
- **Actual:** March 2 shows Ali clocked in at 08:05, "Unsaved". The local copy is written under the `currentDate` prop (the day the page opened), not `selectedDate`, and overwrites that day's copy with the other day's entries. `confirmAbsence` uses `selectedDate` correctly.
- **Suggested fix:** `saveEntriesToStorage(selectedDate, next)` (and add `selectedDate` to the dependencies).
- **Status:** Open

### BUG-212: Changing the date while a change is being saved crashes the page
- **Severity:** Medium
- **Type:** Bug (crash)
- **Location:** `src/components/tables/ClockInPage.tsx`, `scheduleSave` (`setEntries` with `prev[k]` of the new day)
- **Found by:** `ClockInPage.test.tsx` › "survives a date change while a clock-in is still being saved"
- **Steps / input:** Click Clock In, then pick another date within 0.8 s (before the debounced save starts), on a day where the employee is also planned.
- **Expected:** The other day's page is shown.
- **Actual:** The whole page goes blank. The save timer writes `{ _saving: true, _dirty: false }` into the new day's entries; the entry has no `clockIn`, and `calcLate(undefined, …)` throws `Cannot read properties of undefined (reading 'split')` during render. When the save finishes it also puts the old day's record id into the new day's entry, so a later edit would update the old day's record.
- **Suggested fix:** Flush or cancel pending timers when the date changes, and ignore save results whose date isn't the selected one.
- **Status:** Open

### BUG-215: A saved change still counts as "unsaved" after reload and hides the server's newer times
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPage.tsx`, `updateEntry` (stores `_dirty: true`) and `scheduleSave` (never updates the stored copy)
- **Found by:** `ClockInPage.test.tsx` › "shows the server's times after a reload once a clock-in was saved"
- **Steps / input:** Clock Ali in, wait for "✓ Saved". He clocks out on another device (the server now has 16:00). Reload.
- **Expected:** Clock-out 16:00, "✓ Saved".
- **Actual:** No clock-out and "Unsaved": the browser's copy still has `_dirty: true`, so the server's record is ignored. The stale entry is never re-sent either, so it stays like this until someone edits the row (which then overwrites the server's clock-out).
- **Suggested fix:** After a successful save, store the entry with `_dirty: false`; on load, prefer the server's copy unless the local one is newer.
- **Status:** Open

### BUG-213: The page opens on yesterday between midnight and 1 am
- **Severity:** Medium (only for night shifts)
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPage.tsx`, default `currentDate = new Date().toISOString().slice(0, 10)`
- **Found by:** `ClockInPage.test.tsx` › "opens on today's local date just after midnight"
- **Steps / input:** Algeria, March 2 at 00:30.
- **Expected:** The date field shows 2026-03-02.
- **Actual:** 2026-03-01 (the UTC date), so clock-ins made then go to the previous day's records.
- **Suggested fix:** Build the date from local parts (as `ClockInPageHistory`'s `formatDateForInput` does).
- **Status:** Open

### BUG-222: Punches between midnight and 1 am are grouped with the previous day
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `groupedLogs` (`log.timestamp.substring(0, 10)`)
- **Found by:** `ClockInPageHistory.test.tsx` › "pairs a punch just after midnight with the same morning's clock-out"
- **Steps / input:** Punches on March 9 at 00:30 (`2026-03-08T23:30Z`) and 08:00.
- **Expected:** One row: 09/03/2026, 00:30 → 08:00, Validated.
- **Actual:** Two "Not validated" rows, because the punches are grouped by their UTC date while the table shows the Algiers date and time. The "Date" shown for the first row (09/03) doesn't match the group it was put in (08/03).
- **Suggested fix:** Group by the Algiers date (`formatDateTime(...)` / `Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" })`), the same zone the table displays.
- **Status:** Open

### BUG-220: Adding a punch between midnight and 1 am fails after saving it
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `addPunch` (filter `log.timestamp.substring(0, 10) === workDate`)
- **Found by:** `ClockInPageHistory.test.tsx` › "adds a punch made just after midnight"
- **Steps / input:** Add a clock-in for March 9 at 00:30.
- **Expected:** "Clock-in added …" and the day's worktime updated.
- **Actual:** The punch is saved (`2026-03-08T23:30Z`), then "Couldn't add the clock-in. The clock-in was saved, but no records were found for this employee." The worktime isn't updated, and trying again adds a duplicate punch. Same cause as BUG-222 (UTC date compared with a local date).
- **Suggested fix:** Compare dates in the same time zone (see BUG-222).
- **Status:** Open

### BUG-205: A failed load says "No shifts found" instead of showing the error
- **Severity:** Medium
- **Type:** UX
- **Location:** `src/components/tables/ClockInPage.tsx`, the early `if (!loading && !shifts.length) return …`
- **Found by:** `ClockInPage.test.tsx` › "shows the load error when the employees can't be loaded"
- **Steps / input:** `GET /employees` (or `/shifts`) answers 500.
- **Expected:** "Couldn't load today's data …".
- **Actual:** "No shifts found. Add shifts in Shifts Management first." The error is set but the early return comes before the banner, so people are sent to create shifts that already exist.
- **Suggested fix:** Render the error (with a retry) before the "no shifts" message.
- **Status:** Open

### BUG-202: After a failed save, the employees list shows the error instead of the employees
- **Severity:** Medium
- **Type:** UX
- **Location:** `src/components/tables/BasicTableOne.tsx`, `handleSave` (`setApiError`) and the table body
- **Found by:** `BasicTableOne.test.tsx` › "still lists the employees after a failed save is cancelled"
- **Steps / input:** Add an employee, the server refuses (409), click Cancel.
- **Expected:** The list of employees.
- **Actual:** The table shows "⚠ Couldn't save the employee …" in place of every row until the page is reloaded. The same `apiError` state is used for the load error and the save error.
- **Suggested fix:** Keep a separate `saveError` for the drawer (cleared when it closes).
- **Status:** Open

### BUG-216: The machine status always comes from http://localhost:3001
- **Severity:** Low (wrong status, nothing is lost)
- **Type:** Bug / Config
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, `checkDeviceStatus` (hard-coded URL); also `API_BASE_URL` falls back to `http://localhost:3001` instead of `@/lib/config`
- **Found by:** `ClockInPageHistory.test.tsx` › "asks the API server for the machine status"
- **Steps / input:** API at `https://api.test` reports the machine connected.
- **Expected:** "Machine: Connected".
- **Actual:** "Disconnected": the page asks `http://localhost:3001/device/status`, i.e. the viewer's own computer, every 30 s. In production that is always unreachable (and blocked as mixed content on HTTPS). The auth wrapper also sends the bearer token there (see BUG-007).
- **Suggested fix:** `fetch(\`${API_BASE_URL}/device/status\`)` with `API_BASE_URL` from `@/lib/config`.
- **Status:** Open

### BUG-214: A backup who is also planned on the shift is listed twice
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPage.tsx`, `getAttendanceRows` ("Prevent duplicate employee rows")
- **Found by:** `ClockInPage.test.tsx` › "doesn't add a backup row for someone already listed on the shift"
- **Steps / input:** Ali (listed first) is absent and replaced by Sara, who is also planned on the same shift.
- **Expected:** Sara appears once.
- **Actual:** Twice: once as "Backup for Ali Zerrouki" and once as herself. The check only looks at rows added so far, so it works when the backup is listed above the absent employee but not below. Both rows share one React key and one entry.
- **Suggested fix:** Check against all `employees` in the shift (or build the main rows first, then add backups).
- **Status:** Open

### BUG-223: A punch without an id shows an open time editor instead of its time
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/components/tables/ClockInPageHistory.tsx`, Clock In cell (`editingPunch?.logId === log.logs[0]?._id`)
- **Found by:** `ClockInPageHistory.test.tsx` › "shows the time of a punch that has no id"
- **Steps / input:** A log without `_id` (the code handles this case elsewhere, e.g. "has no ID" when deleting).
- **Expected:** The time (08:00), as for other punches.
- **Actual:** With no edit in progress, `undefined === undefined` is true, so the row shows hour/minute dropdowns with ✓/✕ instead of the time.
- **Suggested fix:** `editingPunch !== null && editingPunch.logId === log.logs[0]?._id`.
- **Status:** Open

### BUG-201: The "Last Name" column sorts by first name
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/components/tables/BasicTableOne.tsx`, column list (`{ label: "Last Name", key: "name" }`)
- **Found by:** `BasicTableOne.test.tsx` › "sorts by last name from the Last Name header"
- **Steps / input:** Ali Zerrouki and Sara Amrani; click "Last Name".
- **Expected:** Amrani before Zerrouki.
- **Actual:** Ali first: both name columns use the `"name"` key (`firstName lastName`), and both headers show the active sort arrow.
- **Suggested fix:** Separate `firstName` / `lastName` sort keys.
- **Status:** Open

### BUG-203: Deleting the last employee on the last page leaves an empty page
- **Severity:** Low
- **Type:** UX
- **Location:** `src/components/tables/BasicTableOne.tsx`, `handleDelete` / pagination (`currentPage` isn't clamped)
- **Found by:** `BasicTableOne.test.tsx` › "shows the previous page after the last row of the last page is deleted"
- **Steps / input:** 6 employees, 5 per page. Go to page 2 and delete its only employee.
- **Expected:** Page 1 with the 5 employees.
- **Actual:** "No employees found." and "Showing 6–5 of 5 entries" until Previous is clicked.
- **Suggested fix:** Clamp `currentPage` to `totalPages` (e.g. in an effect or when computing `paginated`).
- **Status:** Open

### BUG-204: The employee form's fields have no accessible names
- **Severity:** Low
- **Type:** Accessibility
- **Location:** `src/components/tables/BasicTableOne.tsx`, `Field`
- **Found by:** `BasicTableOne.test.tsx` › "names each form field by its label"
- **Actual:** `<label>` has no `htmlFor` and the input no `id`, so screen readers announce unnamed text fields and clicking a label doesn't focus its field. (The history page's "Add a clock-in" form has the same problem: the tests find those fields by position.)
- **Suggested fix:** `<label htmlFor={name}>` + `<input id={name}>`, or wrap the input in the label.
- **Status:** Open

## Observations (not bugs, to confirm)

- **BUG-015 and these pages.** `ClockInPage` passes the record id when it knows it, but every first save of an entry (and `addPunch` on the history page, which always passes `null`) goes through the emp + date search. BUG-209 shows the page's per-shift model makes this worse. `saveEditedPunch` matches the existing worktime by `emp_id` only, so for an employee with two shift records it updates whichever comes first.
- **The two pages ask for the planning differently.** `ClockInPage` (via `shifts.api.ts`) calls `/planning?planDate=…`, the history page calls `/planning?date=…`. One of them is probably ignored by the backend. The history page also takes the first planning row for the employee without checking `planDate` or the shift, so if the parameter is ignored it may use another day's shift.
- **Punches are paired by position.** One missing punch shifts every later pair of the day (in/out swap). There's no way to mark a punch as in or out.
- **No pagination on the history page.** `PAGE_SIZE` and `page` are declared but unused; all intervals of the last 50 days are rendered at once.
- **Delete with partial failures.** The code keeps the selection when some deletes fail, but the reload right before clears it anyway.
- **Clock In / Clock Out clicked again** overwrite the earlier time without asking (a double tap on a kiosk replaces the real clock-in time).
- **`confirmAbsence` saves `clock_in: "00:00"`** while other absences omit `clock_in`; reports may treat "00:00" as a real time.
- **Pending saves outlive the page.** Timers aren't cleared on unmount, so a change made just before leaving is still saved (probably wanted, but it updates state of an unmounted component).
- **Employees list:** a blank employee number or salary is saved as `0`; the "Add Employee" button label isn't translated.
- **Unreachable branches** (left uncovered): `confirmAbsence` when the chosen backup isn't in the list, `deleteSelected` when a selected row no longer exists, `formatTime(null)`, the negative-difference branch of `getMinutesBetween`, `BasicTableOne`'s "Delete this employee?" fallback title, and the overnight branches of `saveEditedPunch` (only reachable with the UTC/local mix-up of BUG-220/222).

## Test notes

- Toasts live in a module-level store (`src/lib/notify.ts`), so each test file dismisses them in `afterEach`; otherwise a toast from one test can satisfy the next test's assertion.
- The history page needs a handler for `http://localhost:3001/device/status` in every test (see BUG-216).
- The three test files call `vi.setConfig({ testTimeout: 20000 })`: they wait for the 0.8 s debounced saves and type into several fields, which can pass 5 s when other test files run at the same time.
