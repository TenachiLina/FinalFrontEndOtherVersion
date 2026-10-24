# Test findings: face-recognition clock-in

Scope: `src/components/tables/ClockInFaceRecognitionPage.tsx` and
`src/app/(admin)/(others-pages)/(tables)/clockinfacerecognitionpage/page.tsx`.
Tests: `src/components/tables/ClockInFaceRecognitionPage.test.tsx` and
`src/app/(admin)/(others-pages)/(tables)/clockinfacerecognitionpage/page.test.tsx`.

Each bug has a test marked `it.fails(...)` with a `// BUG-1NN` comment above it.
The test describes the **correct** behaviour and currently fails.

## Open issues

Sorted by severity.

### BUG-101 — Last night's clock-out becomes today's clock-in on overnight shifts
- **Severity:** High
- **Type:** Bug / Payroll
- **Location:** `ClockInFaceRecognitionPage.tsx`, `isPunchInsideOperationalDay` (used by `getDeviceAttendanceForOperationalDate` and `deviceLogsToEntries`)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "does not take last night's clock-out as today's clock-in"
- **Steps / input:** Shift 16:00 → 02:00. Operation date 2026-03-10. Machine logs for employee 101: `2026-03-10T01:30` (clock-out of the 9 March shift), `2026-03-10T16:00`, `2026-03-11T01:45`.
- **Expected:** Clock-in 16:00, clock-out 01:45, 09:45 worked, Present.
- **Actual:** Clock-in 01:30, no clock-out, 14:30 worked, Pending. When any shift crosses midnight, every punch on the operation date counts, including the early-morning punches that close the previous night's shift. All IN/OUT pairs after it are shifted by one, so the hours, delay and overtime are wrong every day for overnight workers. These wrong values are also saved to the worktime automatically.
- **Suggested fix:** On the operation date, skip punches before the latest overnight end (they belong to the previous operation day), just as punches after it are skipped on the next date.
- **Status:** Open

### BUG-102 — A clock-out after an overnight shift's end time is lost
- **Severity:** High
- **Type:** Bug / Payroll
- **Location:** `ClockInFaceRecognitionPage.tsx`, `isPunchInsideOperationalDay` (`parsed.minutes <= overnightEnd`)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "keeps a clock-out made a few minutes after an overnight shift ends"
- **Steps / input:** Shift 16:00 → 02:00. Punches `2026-03-10T16:00` and `2026-03-11T02:10`.
- **Expected:** Clock-out 02:10, 10:10 worked, 00:10 overtime, Present.
- **Actual:** The 02:10 punch is dropped (no clock-out, 00:00 hours, Pending). Next-day punches are only kept up to the exact shift end, with no margin. Anyone leaving even one minute late never gets a clock-out, and that punch is then read as the first punch (clock-in) of the next operation day. Overtime after an overnight shift can never be recorded, although `calcOvertime` is written to handle it. For a shift ending at 00:00 the window is zero minutes, so every clock-out after midnight is lost.
- **Suggested fix:** Keep next-day punches up to the shift end plus a margin (e.g. until the earliest next shift start, or a fixed number of hours). Pair punches per shift, not per calendar window.
- **Status:** Open

### BUG-104 — Shifts ending before 16:00 never get overtime
- **Severity:** Medium (payroll)
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, `calcOvertime` (`if (endMinutes < toMinutes("16:00")) endMinutes += 1440`)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "gives overtime to someone leaving late from a morning shift"
- **Steps / input:** Shift 06:00 → 14:00. Punches 06:00 and 15:00.
- **Expected:** Overtime 01:00 (on screen and in `overtime_minutes`).
- **Actual:** 00:00. Any shift ending before 16:00 is treated as an overnight shift, so its end becomes 24 h later and overtime is never positive. This affects all morning shifts.
- **Suggested fix:** Decide "overnight" from the shift itself (`end < start`), not from a fixed 16:00 cut-off. Pass the shift start to `calcOvertime`.
- **Status:** Open

### BUG-103 — A punch at exactly 00:00 counts as "no punch"
- **Severity:** Medium
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, `"00:00"` used as the "empty" value in `deviceLogsToEntries`, `calcHoursFromPeriods`, `getStatus`, `entryToPayload`, the machine save
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "counts a clock-out at midnight"
- **Steps / input:** Shift 16:00 → 00:00. Punches `2026-03-10T16:00` and `2026-03-11T00:00`.
- **Expected:** Clock-out 00:00, 08:00 worked, Present.
- **Actual:** "No punch", 00:00 hours, Pending, and no `clock_out` is saved. The time 00:00 is also the "not set" marker, so a real punch at 00:00–00:00:59 is lost. A first punch at 00:00 stops the machine save completely ("MACHINE SAVE SKIPPED - no clock-in").
- **Suggested fix:** Use `null`/`""` for "not set" instead of `"00:00"`.
- **Status:** Open

### BUG-105 — No overtime after midnight for a shift ending at 00:00
- **Severity:** Medium (payroll)
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, `calcOvertime` (`actualOut < 12:00 && endMinutes > 1440`)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "gives overtime to someone leaving after a shift that ends at midnight"
- **Steps / input:** Shift 16:00 → 00:00. Saved worktime with clock-in 16:00, clock-out 00:30.
- **Expected:** Overtime 00:30.
- **Actual:** 00:00. The end becomes 1440, but the clock-out is only moved to the next day when the end is *greater* than 1440, so 00:30 counts as 30 minutes after the previous midnight. The function's comment says it handles "16:00 -> 00:00".
- **Suggested fix:** Use `endMinutes >= 1440`, or better, the fix of BUG-104.
- **Status:** Open

### BUG-106 — A failed load says "No shifts found" and hides the error
- **Severity:** Medium
- **Type:** Bug / UX
- **Location:** `ClockInFaceRecognitionPage.tsx`, render (`if (!loading && !shifts.length) return …`), placed before the error banner
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "explains when the day's data can't be loaded"
- **Steps / input:** `GET /employees` answers 500 (or `/shifts` fails, or the network is down).
- **Expected:** "Couldn't load today's data. …"
- **Actual:** "No shifts found. Add shifts in Shifts Management first." The error message is set but never shown. The manager is sent to create shifts that already exist.
- **Suggested fix:** Show `apiError` (with a retry) before the "no shifts" message, and only show "no shifts" when the shifts were loaded.
- **Status:** Open

### BUG-109 — The saved delay is not the delay shown on screen
- **Severity:** Medium (payroll)
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, machine save and `scheduleSave` call `entryToPayload(…, shift.start_time, shift.end_time)`; the table uses `specialTimes` (the planned task's times)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "saves the same delay as the one shown"
- **Steps / input:** Shift 08:00 → 17:00. Planning task for the employee 10:00 → 17:00. Clock-in 10:05.
- **Expected:** Screen and `late_minutes` both 5.
- **Actual:** Screen shows 00:05, `late_minutes: "125"` is saved. Payroll penalises the employee for 2 hours they were not expected to work. Overtime has the same problem with the task end time.
- **Suggested fix:** Compute the payload's start/end the same way as the table (`specialTimes[...] ?? shift times`), ideally with one shared helper.
- **Status:** Open

### BUG-110 — Marking someone with machine punches absent still saves their hours
- **Severity:** Medium (payroll)
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, `toggleAbsent` / `confirmAbsence` with `entryToPayload` (hours recomputed from `entry.periods`)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "does not save worked hours for an absent employee"
- **Steps / input:** Punches 08:00 and 16:00 for employee 101 (saved automatically), then switch on "Absent".
- **Expected:** Saved with `absent: true`, `work_hours: "00:00"`.
- **Actual:** `absent: true`, `work_hours: "08:00"`. Clock-in/out are cleared but the machine periods are kept, and the hours are recomputed from them.
- **Suggested fix:** Clear `periods` and `workHours` when marking absent, or send `work_hours: "00:00"` whenever `absent` is true.
- **Status:** Open

### BUG-111 — New machine punches never appear while the page is open
- **Severity:** Medium
- **Type:** Bug
- **Location:** `ClockInFaceRecognitionPage.tsx`, the "LOAD WORKTIME + MACHINE ATTENDANCE" effect (only runs when the date, employees, shifts or planning change)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "picks up new machine punches"
- **Steps / input:** Open the page with one punch (08:00). The machine records 12:05. Wait 5 minutes.
- **Expected:** The page reads the machine again, shows clock-out 12:05 and saves it.
- **Actual:** The logs are fetched once. The minute timer only re-reads them if the operation date changes, and the machine status is polled every 30 s but not the logs. New punches are neither shown nor saved until someone reloads the page. The auto-save comment ("Every time the machine produces a new punch sequence … we call upsertWorktime()") cannot happen.
- **Suggested fix:** Poll `getDeviceAttendanceForOperationalDate` (e.g. every 30–60 s) and update `deviceLogs`/`deviceEntries` without clearing the table.
- **Status:** Open

### BUG-107 — With no employees the table says "Loading attendance..." for ever
- **Severity:** Low
- **Type:** Bug / UX
- **Location:** `ClockInFaceRecognitionPage.tsx`, `attendanceLoading` starts `true` and is only cleared by the attendance effect, which returns early when `employees` is empty
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "says when there are no employees at all"
- **Steps / input:** A company with shifts but no employees.
- **Expected:** "No employees found in the database."
- **Actual:** "Loading attendance..." never goes away. The "No employees found" message can never be shown.
- **Suggested fix:** Set `attendanceLoading` to `false` in the early return (or start it at `false`).
- **Status:** Open

### BUG-108 — A failed save shows "✓ Saved" for employees with machine punches
- **Severity:** Low
- **Type:** Bug / UX
- **Location:** `ClockInFaceRecognitionPage.tsx`, `getEntry` (returns `_dirty: false` whenever the machine has data)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "shows that a change was not saved for an employee with machine punches"
- **Steps / input:** Employee with punches (saved automatically). Type a penalty while the backend answers 500 to the save.
- **Expected:** The row says "Unsaved".
- **Actual:** The banner shows the error but the row still says "✓ Saved", so once the banner is closed nothing shows that the penalty was lost. The same happens when the automatic machine save fails.
- **Suggested fix:** In `getEntry`, keep `stored._dirty` instead of forcing `false`.
- **Status:** Open

### BUG-112 — Machine logs and saved payloads are printed to the browser console
- **Severity:** Low (privacy and noise)
- **Type:** Security / Cleanup
- **Location:** `ClockInFaceRecognitionPage.tsx`, `loadAttendance` and the machine save (about 40 `console.log`/`console.error` calls)
- **Found by:** `ClockInFaceRecognitionPage.test.tsx` › "doesn't print attendance data to the console"
- **Actual:** Every load prints all device logs (employee numbers and punch times) and every save prints the full payload and the backend response. Anyone who opens DevTools on the manager's computer can read them. Same problem as BUG-013 in `worktime.api.ts`.
- **Suggested fix:** Remove the logs, or only log when `process.env.NODE_ENV === "development"`.
- **Status:** Open

## Observations

Things that look wrong but could not be proven to be defects, or that are outside these files.

- **The manual time edit cannot be opened.** `openManualInput`, `saveManualTime` and the "Edit Clock-In Time" modal (about 150 lines) exist, but nothing on the page calls `openManualInput`, so a manager cannot correct a wrong machine time on this page. `formatDateTime` is also unused. These lines are the main part of the file the tests cannot reach.
- **"Reset" only clears the screen.** It clears the table and the browser copy, but nothing is sent to the backend. After a reload the saved records (and the machine punches) come back. The dialog says "times shown for this day will be cleared", so this may be intended, but managers may expect a real reset.
- **A failed update creates a new record.** When the update of a known worktime id fails, `upsertWorktime` (in `worktime.api.ts`) searches again and then POSTs. Seen while testing BUG-108: a 500 on `PUT /worktime/:id` was followed by `POST /worktime`, which can create a duplicate record for the day (see BUG-015).
- **A failed machine save is not retried.** The signature is not stored on failure, but the effect only runs again when the logs, date, planning or shift tab change.
- **Machine times show in every shift tab.** `getEntry` overlays the machine punches by employee number only, so someone planned on two shifts shows the same times (and hours) in both tabs.
- **Old browser copies are reused.** Rows kept in `localStorage` (`worktime_<date>`) with `_dirty: true` are shown over the database record but are never sent again. Rows for records deleted from the database stay visible.
- **Technical error text is shown.** Load errors show e.g. "Couldn't load the face-recognition clock-ins. Face-recognition API returned 500 for 2026-03-10" or "[api] 500 …" (see BUG-014).
- **Legacy single backup ignored.** Only `planning.backupEmpIds` is offered in the absence dialog. Old planning documents with only `backupEmpId` show no backup choice.

- **Machine punches can be saved more than once while the page is still loading.** When the full suite ran under heavy load, the auto-save effect ran again before all data had arrived. It searched for the day's record twice (`GET /worktime?emp_id=101&work_date=…`). The save signature includes the computed periods, so an intermediate state counts as "new". Against the real backend, the second save finds the first record and updates it, so no duplicate record is created, but an intermediate (possibly incomplete) state is written briefly. The test "creates the day's worktime from the punches" now checks the final save rather than the exact number of requests. To make this deterministic, wait until employees, shifts, planning and device logs have all loaded before saving.
