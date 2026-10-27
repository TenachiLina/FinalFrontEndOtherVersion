# Test findings: New planning (DoPlanning)

Scope: `src/hooks/useNewPlanning.ts`, `src/components/calendar/NewPlanning.tsx`,
`src/components/calendar/types.ts`, `src/app/(admin)/(others-pages)/calendar/(calander)/DoPlanning/page.tsx`.

Tests: `src/hooks/useNewPlanning.{load,assign,save,import}.test.tsx`,
`src/components/calendar/NewPlanning.test.tsx`, `DoPlanning/page.test.tsx`
(shared data and fake backend in `src/hooks/useNewPlanning.fixtures.ts`).

Each bug has an `it.fails(...)` test with a `// BUG-3NN` comment above it.

## Open issues

Sorted by severity.

### BUG-302: Saving while the next day is loading writes the previous day's planning onto it
- **Severity:** High
- **Type:** Data-loss
- **Location:** `src/hooks/useNewPlanning.ts`, `handleSavePlanning` (also `handleSaveToAllWeekdays` / `handleSaveToNextWeekdays`); `src/components/calendar/NewPlanning.tsx`, the Save buttons
- **Found by:** `useNewPlanning.save.test.tsx` › "does not save the previous day's employees onto a day that is still loading"
- **Steps / input:** Saturday 24 has Alice planned. Click "next day" and, before `GET /planning/import/2026-10-25` answers, click Save.
- **Expected:** Nothing is saved for the 25th until its planning is loaded (or Save is disabled while `loadingGrid` is true).
- **Actual:** `currentDate` is already the 25th but `grid` still holds the 24th, so `POST /planning/bulk` sends Alice with `planDate: "2026-10-25"`, replacing the 25th's real planning. The grid of the 24th stays on screen while loading, so the user can't tell.
- **Suggested fix:** Disable the three Save buttons while `loadingGrid` is true and return early in the save handlers when it is; better, clear the grid (or store the date the grid belongs to) when the date changes and save with that date.
- **Status:** Open

### BUG-305: An employee listed twice in an imported file is added twice to the same cell
- **Severity:** Medium
- **Type:** Bug / Data integrity
- **Location:** `src/hooks/useNewPlanning.ts`, `handleImportFile` (Excel and PDF branches: `importedGrid[defaultPost.id][shift.id].push(currentEmployee)`)
- **Found by:** `useNewPlanning.import.test.tsx` › "imports an employee listed twice under the same hour only once" (Excel and PDF)
- **Steps / input:** Excel with two `06H` rows both containing "Alice Martin" (or a PDF where `06H` / "Alice Martin" appears on two pages).
- **Expected:** Alice appears once in the cell, as `handleSave`, `handleEdit` and the loader (fix 5feb993) guarantee everywhere else.
- **Actual:** She is pushed twice; Save then sends two identical entries, which is the duplicate the "CleanPlanningFromDuplicates" commit set out to stop. The grid also renders two elements with the same React key.
- **Suggested fix:** Before pushing, look for an existing cell with the same `id`; if found, make it `currentEmployee` (so its "Backup:" lines still merge) instead of adding a new one.
- **Status:** Open

### BUG-306: PDF import puts employees of unlisted hours into the previous hour's shift
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/hooks/useNewPlanning.ts`, `handleImportFile`, PDF branch (`/^(06|07|08|09|10|11|12|14|15|16)H$/i`)
- **Found by:** `useNewPlanning.import.test.tsx` › "puts the employees of an 18:00 shift in the 18:00 shift"
- **Steps / input:** Shifts 06:00–14:00 and 18:00–23:00. PDF text: `06H`, `Alice Martin`, `18H`, `Bob Brown`.
- **Expected:** Bob goes to the 18:00 shift (the Excel import accepts any hour).
- **Actual:** `18H` is not recognised as an hour (13H and 17H–05H aren't either), so it is reported as an unknown employee and Bob is added to the 06:00 shift. Saving then stores him on the wrong shift.
- **Suggested fix:** Match any hour (`/^([01]?\d|2[0-3])H$/i`) and let `findShiftByHour` decide; when no shift matches, set `currentShiftId = null` (already done) so the names under it are skipped rather than misplaced.
- **Status:** Open

### BUG-301: Typing a new main employee without picking him shows his name but keeps the old employee
- **Severity:** Medium
- **Type:** Bug / Data integrity
- **Location:** `src/hooks/useNewPlanning.ts`, `handleEdit`
- **Found by:** `useNewPlanning.assign.test.tsx` › "never shows a name that differs from the employee who will be saved"
- **Steps / input:** Edit Alice's assignment, click Remove (or type over the name), type "Bob Brown" but don't click him in the list, click Update.
- **Expected:** Either the update is refused ("pick an employee from the list") or the cell keeps Alice's name.
- **Actual:** The cell shows "Bob Brown" (`title: editTitle.trim()`) while its `id` is still Alice's, so Save stores Alice. With an empty field the cell shows an empty name.
- **Suggested fix:** In `handleEdit`, when `editSelectedEmployee` is null and the typed text differs from the current title, warn and return; or always use the employee record's name for `title`.
- **Status:** Open

### BUG-303: Days are off by one when the browser is in a time zone ahead of Algiers
- **Severity:** Low (Medium if managers use the app from France or further east)
- **Type:** Bug
- **Location:** `src/hooks/useNewPlanning.ts`, `getSameWeekdayDatesInMonth` / `handleSaveToAllWeekdays`; `src/components/calendar/NewPlanning.tsx`, mini calendar (`setCurrentDate(date)` with `getCalendarDays` dates)
- **Found by:** `useNewPlanning.save.test.tsx` › "saves on Saturdays, not Fridays, for a manager whose browser is in Paris"; `NewPlanning.test.tsx` › "loads the clicked day, not the day before, for a manager whose browser is in Paris"
- **Steps / input:** `TZ=Europe/Paris` (UTC+2 in summer), today Saturday 24 Oct 2026. Click "Save to every Saturday", or click 20 in the mini calendar.
- **Expected:** Saves on 3, 10, 17, 24, 31 Oct; clicking 20 loads 2026-10-20.
- **Actual:** Dates are built at local midnight and then converted with `timeZone: "Africa/Algiers"`, which is 23:00 the previous day: it saves on 2, 9, 16, 23 (Fridays, overwriting them) and 31, and clicking 20 loads and saves 2026-10-19 while 20 is highlighted.
- **Suggested fix:** Build these dates at noon (`new Date(y, m, d, 12)`), or format them with local `getFullYear/getMonth/getDate` instead of converting to Algiers time.
- **Status:** Open

### BUG-304: A failed day in "Save to every / next weekday" shows the raw server reply
- **Severity:** Low
- **Type:** UX
- **Location:** `src/hooks/useNewPlanning.ts`, `handleSaveToAllWeekdays` and `handleSaveToNextWeekdays` (`throw new Error(\`${planDate}: ${res.status} ${errText}\`)`)
- **Found by:** `useNewPlanning.save.test.tsx` › "explains a failed day in plain words, without the raw server reply"
- **Steps / input:** One of the five `POST /planning/bulk` calls answers 500 `{"message":"Database is read-only"}`.
- **Expected:** "Copied to 4 of 5 days (Saturday). Something went wrong on our side. Please try again in a moment."
- **Actual:** "Copied to 4 of 5 days (Saturday). 2026-10-10: 500 {"message":"Database is read-only"}". The date prefix stops `friendlyError` from recognising the `"<status> <body>"` format, so technical text is shown, against the rule in `src/lib/errors.ts`.
- **Suggested fix:** Use `await ensureOk(res)` (as `handleSavePlanning` does) and, if the date is wanted, add it outside the error message.
- **Status:** Open

## Observations

Not proven wrong, but worth a look:

- **Same employee in two posts of the same shift.** Nothing stops Alice from being planned as Pizzaiolo and Livreur in the same shift (test "lets the same employee be planned in another cell"). If one person can't hold two posts at once, add a check in `handleSave` / `handleEdit` / imports across the whole shift column.
- **Imports go to the first post only.** Excel and PDF imports put every employee in `posts[0]`, and replace the whole grid (any unsaved changes are lost without a warning).
- **Shifts are matched by start hour only.** Two shifts starting at the same hour (e.g. 06:00–14:00 and 06:30–15:00) make `findShiftByHour` pick the first one.
- **Unreachable code.** The `catch` blocks of `handleSaveToAllWeekdays` / `handleSaveToNextWeekdays` (everything is inside `Promise.allSettled`), `if (targetDates.length === 0) return;`, the `!cleanLine` check in the PDF branch, and `validHours` (unused) can't run. These are the only uncovered lines of the hook.
- **`types.ts` constants are unused.** `POSTS` and `SHIFTS` aren't imported anywhere (and `shift-2` / `shift-3` are identical, with labels like "16:00 PM"). They are the only uncovered lines of `types.ts`; consider deleting them.
- **Planning load relies on a flattened API shape.** The loader reads `record.empId` as an id string and `record.title` / `record.id`, unlike the `PlanningRecord` type (`empId: EmployeeRecord`, `_id`). If `/planning/import/:date` ever returns populated documents, the duplicate check (`c.id === record.empId`) and the grid break silently.
- **Debug logging.** `handleSave` and `handleSavePlanning` log the whole grid to the console on every call.
