# Test Findings Log

Problems found while writing tests. Each bug has a test marked `it.fails(...)`
with a `// BUG-0XX` comment above it: the test describes the **correct**
behaviour and currently fails. When the bug is fixed, that test starts
"passing unexpectedly", which makes Vitest fail: change `it.fails` to `it`
and move the entry to **Fixed issues**.

Rules:
- Never change a test to make it pass when the code is wrong: log it here.
- Add the entry when the problem is found, before fixing it.
- One fix per commit: `fix: BUG-0XX <title>`.

Run: `npm test` (watch), `npm run test:run`, `npm run coverage` (report in `coverage/index.html`).

## Coverage progress

| Date | Phase | Lines | Branches | Functions | Notes |
|------|-------|-------|----------|-----------|-------|
| 2026-10-24 | Baseline | 0% | 0% | 0% | No tests, no runner |
| 2026-10-24 | 0–2: tooling + `src/lib` + API wrappers | 9.81% (557/5676) | 11.18% | 9.12% | 258 tests + 17 known bugs. `src/lib` at 100% lines |
| 2026-10-24 | 3–6: hooks, contexts, layout, components, pages | **98.89% (5435/5496)** | **94.22%** | **98.73%** | 1,359 tests + 116 known-bug tests in 80 files. Same result on two consecutive full runs |
| 2026-10-24 | 7–8: end-to-end + CI | n/a | n/a | n/a | 12 Playwright tests on the production build (mocked backend), green on two runs. CI runs lint, type-check, coverage gate, build and e2e |

## Bug files

Bugs are numbered by area. Each area file has the full entries plus an Observations section.

| IDs | Area | File |
|-----|------|------|
| BUG-001 – 015 | `src/lib`, API helpers | this file, below |
| BUG-101 – 112 | Face-recognition clock-in | [findings/clockin-face.md](findings/clockin-face.md) |
| BUG-201 – 223 | Clock-in, clock-in history, employees list | [findings/clockin.md](findings/clockin.md) |
| BUG-301 – 306 | New planning | [findings/new-planning.md](findings/new-planning.md) |
| BUG-401 – 407 | View planning, shifts management | [findings/view-planning.md](findings/view-planning.md) |
| BUG-501 – 515 | Reporting, payroll, advances, bonuses | [findings/reporting.md](findings/reporting.md) |
| BUG-601 – 606 | Admin screens, sign-in, kiosk, profile | [findings/admin.md](findings/admin.md) |
| BUG-701 – 713 | UI kit, forms, help, template pages | [findings/ui.md](findings/ui.md) |

## All open bugs, by severity

**97 open bugs: 11 High, 43 Medium, 43 Low.** Details (steps, expected, actual, suggested fix) are in the area files linked from each row.

| ID | Severity | Area | Bug |
|----|----------|------|-----|
| [BUG-015](#bug-015-saving-a-worktime-can-overwrite-another-employees-record) | High | lib & API helpers | Saving a worktime can overwrite another employee's record |
| [BUG-101](findings/clockin-face.md#bug-101-last-nights-clock-out-becomes-todays-clock-in-on-overnight-shifts) | High | Face-recognition clock-in | Last night's clock-out becomes today's clock-in on overnight shifts |
| [BUG-102](findings/clockin-face.md#bug-102-a-clock-out-after-an-overnight-shifts-end-time-is-lost) | High | Face-recognition clock-in | A clock-out after an overnight shift's end time is lost |
| [BUG-206](findings/clockin.md#bug-206-leaving-early-on-a-shift-that-ends-after-midnight-counts-21-hours-of-overtime) | High | Clock-in, history, employees | Leaving early on a shift that ends after midnight counts ~21 hours of overtime |
| [BUG-209](findings/clockin.md#bug-209-clocking-in-on-a-second-shift-overwrites-the-first-shifts-record) | High | Clock-in, history, employees | Clocking in on a second shift overwrites the first shift's record |
| [BUG-217](findings/clockin.md#bug-217-adding-a-punch-on-the-history-page-wipes-the-days-penalty-consumption-and-bonus) | High | Clock-in, history, employees | Adding a punch on the history page wipes the day's penalty, consumption and bonus |
| [BUG-218](findings/clockin.md#bug-218-the-history-page-counts-lateness-and-overtime-from-midnight) | High | Clock-in, history, employees | The history page counts lateness and overtime from midnight |
| [BUG-221](findings/clockin.md#bug-221-editing-a-punch-shows-its-utc-time-and-saving-it-moves-the-punch-an-hour) | High | Clock-in, history, employees | Editing a punch shows its UTC time, and saving it moves the punch an hour |
| [BUG-302](findings/new-planning.md#bug-302-saving-while-the-next-day-is-loading-writes-the-previous-days-planning-onto-it) | High | New planning | Saving while the next day is loading writes the previous day's planning onto it |
| [BUG-406](findings/view-planning.md#bug-406-backups-saved-by-the-planning-editor-never-appear-in-view-planning) | High | View planning & shifts | Backups saved by the planning editor never appear in View Planning |
| [BUG-503](findings/reporting.md#bug-503-the-employee-page-sends-a-zero-or-negative-weekly-advance) | High | Reporting & payroll | The employee page sends a zero or negative weekly advance |
| [BUG-001](#bug-001-date-ranges-start-a-day-early-in-time-zones-behind-utc) | Medium | lib & API helpers | Date ranges start a day early in time zones behind UTC |
| [BUG-003](#bug-003-plans-on-the-first-day-of-a-range-are-missed-in-time-zones-behind-utc) | Medium | lib & API helpers | Plans on the first day of a range are missed in time zones behind UTC |
| [BUG-007](#bug-007-the-login-token-is-sent-to-any-host-whose-address-starts-like-the-apis) | Medium | lib & API helpers | The login token is sent to any host whose address starts like the API's |
| [BUG-009](#bug-009-a-refused-refresh-token-is-sent-a-second-time) | Medium | lib & API helpers | A refused refresh token is sent a second time |
| [BUG-012](#bug-012-a-delete-answered-with-204-no-content-is-reported-as-a-failure) | Medium | lib & API helpers | A delete answered with "204 No Content" is reported as a failure |
| [BUG-103](findings/clockin-face.md#bug-103-a-punch-at-exactly-0000-counts-as-no-punch) | Medium | Face-recognition clock-in | A punch at exactly 00:00 counts as "no punch" |
| [BUG-104](findings/clockin-face.md#bug-104-shifts-ending-before-1600-never-get-overtime) | Medium | Face-recognition clock-in | Shifts ending before 16:00 never get overtime |
| [BUG-105](findings/clockin-face.md#bug-105-no-overtime-after-midnight-for-a-shift-ending-at-0000) | Medium | Face-recognition clock-in | No overtime after midnight for a shift ending at 00:00 |
| [BUG-106](findings/clockin-face.md#bug-106-a-failed-load-says-no-shifts-found-and-hides-the-error) | Medium | Face-recognition clock-in | A failed load says "No shifts found" and hides the error |
| [BUG-109](findings/clockin-face.md#bug-109-the-saved-delay-is-not-the-delay-shown-on-screen) | Medium | Face-recognition clock-in | The saved delay is not the delay shown on screen |
| [BUG-110](findings/clockin-face.md#bug-110-marking-someone-with-machine-punches-absent-still-saves-their-hours) | Medium | Face-recognition clock-in | Marking someone with machine punches absent still saves their hours |
| [BUG-111](findings/clockin-face.md#bug-111-new-machine-punches-never-appear-while-the-page-is-open) | Medium | Face-recognition clock-in | New machine punches never appear while the page is open |
| [BUG-202](findings/clockin.md#bug-202-after-a-failed-save-the-employees-list-shows-the-error-instead-of-the-employees) | Medium | Clock-in, history, employees | After a failed save, the employees list shows the error instead of the employees |
| [BUG-205](findings/clockin.md#bug-205-a-failed-load-says-no-shifts-found-instead-of-showing-the-error) | Medium | Clock-in, history, employees | A failed load says "No shifts found" instead of showing the error |
| [BUG-207](findings/clockin.md#bug-207-arriving-after-midnight-on-a-night-shift-isnt-counted-as-late) | Medium | Clock-in, history, employees | Arriving after midnight on a night shift isn't counted as late |
| [BUG-208](findings/clockin.md#bug-208-the-delay-saved-to-the-server-isnt-the-one-the-page-shows) | Medium | Clock-in, history, employees | The delay saved to the server isn't the one the page shows |
| [BUG-210](findings/clockin.md#bug-210-reset-only-clears-the-screen-the-times-come-back-on-reload) | Medium | Clock-in, history, employees | "Reset" only clears the screen; the times come back on reload |
| [BUG-211](findings/clockin.md#bug-211-after-changing-the-date-the-new-days-times-are-stored-under-the-first-day) | Medium | Clock-in, history, employees | After changing the date, the new day's times are stored under the first day |
| [BUG-212](findings/clockin.md#bug-212-changing-the-date-while-a-change-is-being-saved-crashes-the-page) | Medium | Clock-in, history, employees | Changing the date while a change is being saved crashes the page |
| [BUG-213](findings/clockin.md#bug-213-the-page-opens-on-yesterday-between-midnight-and-1-am) | Medium | Clock-in, history, employees | The page opens on yesterday between midnight and 1 am |
| [BUG-215](findings/clockin.md#bug-215-a-saved-change-still-counts-as-unsaved-after-reload-and-hides-the-servers-newer-times) | Medium | Clock-in, history, employees | A saved change still counts as "unsaved" after reload and hides the server's newer times |
| [BUG-219](findings/clockin.md#bug-219-worked-hours-run-from-the-first-to-the-last-punch-so-breaks-are-paid) | Medium | Clock-in, history, employees | Worked hours run from the first to the last punch, so breaks are paid |
| [BUG-220](findings/clockin.md#bug-220-adding-a-punch-between-midnight-and-1-am-fails-after-saving-it) | Medium | Clock-in, history, employees | Adding a punch between midnight and 1 am fails after saving it |
| [BUG-222](findings/clockin.md#bug-222-punches-between-midnight-and-1-am-are-grouped-with-the-previous-day) | Medium | Clock-in, history, employees | Punches between midnight and 1 am are grouped with the previous day |
| [BUG-301](findings/new-planning.md#bug-301-typing-a-new-main-employee-without-picking-him-shows-his-name-but-keeps-the-old-employee) | Medium | New planning | Typing a new main employee without picking him shows his name but keeps the old employee |
| [BUG-305](findings/new-planning.md#bug-305-an-employee-listed-twice-in-an-imported-file-is-added-twice-to-the-same-cell) | Medium | New planning | An employee listed twice in an imported file is added twice to the same cell |
| [BUG-306](findings/new-planning.md#bug-306-pdf-import-puts-employees-of-unlisted-hours-into-the-previous-hours-shift) | Medium | New planning | PDF import puts employees of unlisted hours into the previous hour's shift |
| [BUG-401](findings/view-planning.md#bug-401-a-slow-answer-for-the-previous-day-replaces-the-planning-of-the-selected-day) | Medium | View planning & shifts | A slow answer for the previous day replaces the planning of the selected day |
| [BUG-402](findings/view-planning.md#bug-402-in-time-zones-ahead-of-algeria-a-picked-day-shows-the-previous-days-planning) | Medium | View planning & shifts | In time zones ahead of Algeria, a picked day shows the previous day's planning |
| [BUG-403](findings/view-planning.md#bug-403-deleting-a-shift-that-is-still-in-use-never-asks-to-force-the-delete) | Medium | View planning & shifts | Deleting a shift that is still in use never asks to force the delete |
| [BUG-405](findings/view-planning.md#bug-405-a-slow-active-list-replaces-the-archived-list-after-switching-tabs) | Medium | View planning & shifts | A slow Active list replaces the Archived list after switching tabs |
| [BUG-501](findings/reporting.md#bug-501-a-slow-answer-for-a-previous-range-replaces-the-range-chosen-last) | Medium | Reporting & payroll | A slow answer for a previous range replaces the range chosen last |
| [BUG-502](findings/reporting.md#bug-502-when-the-planning-cant-be-loaded-the-payroll-and-weekly-advances-lists-are-empty) | Medium | Reporting & payroll | When the planning can't be loaded, the payroll and weekly advances lists are empty |
| [BUG-504](findings/reporting.md#bug-504-a-double-click-on-give-advance-gives-the-advance-twice) | Medium | Reporting & payroll | A double click on "Give Advance" gives the advance twice |
| [BUG-506](findings/reporting.md#bug-506-hours-worked-by-an-employee-without-a-planning-entry-are-left-out-of-the-payroll) | Medium | Reporting & payroll | Hours worked by an employee without a planning entry are left out of the payroll |
| [BUG-507](findings/reporting.md#bug-507-west-of-utc-picked-weeks-start-a-day-early-or-last-6-days) | Medium | Reporting & payroll | West of UTC, picked weeks start a day early or last 6 days |
| [BUG-508](findings/reporting.md#bug-508-advances-and-bonuses-are-deleted-with-one-click-without-confirmation) | Medium | Reporting & payroll | Advances and bonuses are deleted with one click, without confirmation |
| [BUG-513](findings/reporting.md#bug-513-typing-a-week-start-on-the-employee-page-scrambles-the-date) | Medium | Reporting & payroll | Typing a week start on the employee page scrambles the date |
| [BUG-515](findings/reporting.md#bug-515-the-attendance-page-loads-two-different-weeks-on-open-and-the-slower-one-wins) | Medium | Reporting & payroll | The attendance page loads two different weeks on open, and the slower one wins |
| [BUG-605](findings/admin.md#bug-605-sign-in-can-redirect-to-another-site-through-next) | Medium | Admin, auth, kiosk | Sign-in can redirect to another site through `?next=` |
| [BUG-701](findings/ui.md#bug-701-the-modals-close-button-has-no-accessible-name) | Medium | UI kit, forms, help | The Modal's close button has no accessible name |
| [BUG-702](findings/ui.md#bug-702-the-modal-isnt-exposed-as-a-dialog) | Medium | UI kit, forms, help | The Modal isn't exposed as a dialog |
| [BUG-708](findings/ui.md#bug-708-close-in-a-modal-form-submits-the-form) | Medium | UI kit, forms, help | "Close" in a modal form submits the form |
| [BUG-002](#bug-002-a-company-setting-of-0-is-ignored) | Low | lib & API helpers | A company setting of 0 is ignored |
| [BUG-004](#bug-004-date-filters-in-the-url-arent-validated) | Low | lib & API helpers | Date filters in the URL aren't validated |
| [BUG-005](#bug-005-negative-durations-are-converted-wrongly) | Low | lib & API helpers | Negative durations are converted wrongly |
| [BUG-006](#bug-006-non-numeric-values-become-nan-in-worktime-rows) | Low | lib & API helpers | Non-numeric values become NaN in worktime rows |
| [BUG-008](#bug-008-a-failed-branding-request-is-cached-until-the-page-is-reloaded) | Low | lib & API helpers | A failed branding request is cached until the page is reloaded |
| [BUG-010](#bug-010-downloading-a-file-whose-name-contains--fails) | Low | lib & API helpers | Downloading a file whose name contains "%" fails |
| [BUG-011](#bug-011-a-manager-or-admin-with-no-company-can-open-the-activity-log) | Low | lib & API helpers | A manager or admin with no company can open the activity log |
| [BUG-013](#bug-013-worktime-responses-are-printed-to-the-browser-console) | Low | lib & API helpers | Worktime responses are printed to the browser console |
| [BUG-014](#bug-014-errors-from-shiftsapits-and-worktimeapits-show-raw-server-text) | Low | lib & API helpers | Errors from `shifts.api.ts` and `worktime.api.ts` show raw server text |
| [BUG-107](findings/clockin-face.md#bug-107-with-no-employees-the-table-says-loading-attendance-for-ever) | Low | Face-recognition clock-in | With no employees the table says "Loading attendance..." for ever |
| [BUG-108](findings/clockin-face.md#bug-108-a-failed-save-shows--saved-for-employees-with-machine-punches) | Low | Face-recognition clock-in | A failed save shows "✓ Saved" for employees with machine punches |
| [BUG-112](findings/clockin-face.md#bug-112-machine-logs-and-saved-payloads-are-printed-to-the-browser-console) | Low | Face-recognition clock-in | Machine logs and saved payloads are printed to the browser console |
| [BUG-201](findings/clockin.md#bug-201-the-last-name-column-sorts-by-first-name) | Low | Clock-in, history, employees | The "Last Name" column sorts by first name |
| [BUG-203](findings/clockin.md#bug-203-deleting-the-last-employee-on-the-last-page-leaves-an-empty-page) | Low | Clock-in, history, employees | Deleting the last employee on the last page leaves an empty page |
| [BUG-204](findings/clockin.md#bug-204-the-employee-forms-fields-have-no-accessible-names) | Low | Clock-in, history, employees | The employee form's fields have no accessible names |
| [BUG-214](findings/clockin.md#bug-214-a-backup-who-is-also-planned-on-the-shift-is-listed-twice) | Low | Clock-in, history, employees | A backup who is also planned on the shift is listed twice |
| [BUG-216](findings/clockin.md#bug-216-the-machine-status-always-comes-from-httplocalhost3001) | Low | Clock-in, history, employees | The machine status always comes from http://localhost:3001 |
| [BUG-223](findings/clockin.md#bug-223-a-punch-without-an-id-shows-an-open-time-editor-instead-of-its-time) | Low | Clock-in, history, employees | A punch without an id shows an open time editor instead of its time |
| [BUG-303](findings/new-planning.md#bug-303-days-are-off-by-one-when-the-browser-is-in-a-time-zone-ahead-of-algiers) | Low | New planning | Days are off by one when the browser is in a time zone ahead of Algiers |
| [BUG-304](findings/new-planning.md#bug-304-a-failed-day-in-save-to-every--next-weekday-shows-the-raw-server-reply) | Low | New planning | A failed day in "Save to every / next weekday" shows the raw server reply |
| [BUG-404](findings/view-planning.md#bug-404-a-failed-shift-delete-shows-the-raw-technical-error) | Low | View planning & shifts | A failed shift delete shows the raw technical error |
| [BUG-407](findings/view-planning.md#bug-407-today-and-the-day-arrows-dont-move-the-mini-calendar-so-the-selected-day-cant-be-seen) | Low | View planning & shifts | "Today" and the day arrows don't move the mini calendar, so the selected day can't be seen |
| [BUG-505](findings/reporting.md#bug-505-a-failed-undo-on-the-employee-page-is-silent) | Low | Reporting & payroll | A failed "Undo" on the employee page is silent |
| [BUG-509](findings/reporting.md#bug-509-total-hours-show-floating-point-noise) | Low | Reporting & payroll | Total hours show floating-point noise |
| [BUG-510](findings/reporting.md#bug-510-the-month-picker-ignores-the-month-being-shown) | Low | Reporting & payroll | The month picker ignores the month being shown |
| [BUG-511](findings/reporting.md#bug-511-the-bonus-totals-row-mixes-filtered-and-unfiltered-figures) | Low | Reporting & payroll | The bonus totals row mixes filtered and unfiltered figures |
| [BUG-512](findings/reporting.md#bug-512-the-overview-shows-a-rise-as-a-fall-when-the-previous-value-was-negative) | Low | Reporting & payroll | The Overview shows a rise as a fall when the previous value was negative |
| [BUG-514](findings/reporting.md#bug-514-the-employee-page-shows-0-in-the-absent-column-for-days-worked) | Low | Reporting & payroll | The employee page shows "0" in the Absent column for days worked |
| [BUG-601](findings/admin.md#bug-601-a-cancelled-password-reset-pre-fills-the-next-users-new-password) | Low | Admin, auth, kiosk | A cancelled password reset pre-fills the next user's new password |
| [BUG-602](findings/admin.md#bug-602-clicking-next-right-after-the-list-loads-jumps-back-to-page-1) | Low | Admin, auth, kiosk | Clicking "Next" right after the list loads jumps back to page 1 |
| [BUG-603](findings/admin.md#bug-603-a-kiosk-account-is-stuck-on-loading-when-the-company-has-clock-in-switched-off) | Low | Admin, auth, kiosk | A kiosk account is stuck on "Loading…" when the company has clock-in switched off |
| [BUG-604](findings/admin.md#bug-604-the-kiosk-lists-loading-text-isnt-translated) | Low | Admin, auth, kiosk | The kiosk list's loading text isn't translated |
| [BUG-606](findings/admin.md#bug-606-the-profile-page-shows-a-made-up-person-and-its-save-does-nothing) | Low | Admin, auth, kiosk | The profile page shows a made-up person and its Save does nothing |
| [BUG-703](findings/ui.md#bug-703-multiselects-arrow-button-never-opens-the-list) | Low | UI kit, forms, help | MultiSelect's arrow button never opens the list |
| [BUG-704](findings/ui.md#bug-704-removing-a-multiselect-chip-opens-the-option-list) | Low | UI kit, forms, help | Removing a MultiSelect chip opens the option list |
| [BUG-705](findings/ui.md#bug-705-a-disabled-multiselect-still-lets-you-remove-options) | Low | UI kit, forms, help | A disabled MultiSelect still lets you remove options |
| [BUG-706](findings/ui.md#bug-706-switch-cant-be-used-with-the-keyboard) | Low | UI kit, forms, help | Switch can't be used with the keyboard |
| [BUG-707](findings/ui.md#bug-707-phoneinput-always-starts-on-the-us-prefix) | Low | UI kit, forms, help | PhoneInput always starts on the US prefix |
| [BUG-709](findings/ui.md#bug-709-okay-got-it-doesnt-close-the-alert-modals) | Low | UI kit, forms, help | "Okay, Got It" doesn't close the alert modals |
| [BUG-710](findings/ui.md#bug-710-the-language-menu-cant-be-closed-with-escape) | Low | UI kit, forms, help | The language menu can't be closed with Escape |
| [BUG-711](findings/ui.md#bug-711-the-theme-toggle-buttons-have-no-accessible-name) | Low | UI kit, forms, help | The theme toggle buttons have no accessible name |
| [BUG-712](findings/ui.md#bug-712-tooltips-cant-be-seen-with-the-keyboard) | Low | UI kit, forms, help | Tooltips can't be seen with the keyboard |
| [BUG-713](findings/ui.md#bug-713-the-headers-more-button-on-phones-has-no-name-or-state) | Low | UI kit, forms, help | The header's "more" button on phones has no name or state |

## Open issues: lib and API helpers

Sorted by severity.

### BUG-015: Saving a worktime can overwrite another employee's record
- **Severity:** High (needs backend confirmation)
- **Type:** Data-loss
- **Location:** `src/components/tables/worktime.api.ts`, `upsertWorktime`
- **Found by:** `worktime.api.test.ts` › "never updates another employee's record"
- **Steps / input:** `upsertWorktime({ emp_id: 101, work_date: "2026-03-01" })` with no known id. The search `GET /worktime?emp_id=101&work_date=2026-03-01` returns a record for employee 202.
- **Expected:** Only a record with the same `emp_id` and `work_date` is updated. Otherwise a new one is created.
- **Actual:** `existing[0]` is updated whatever it is. `src/lib/reporting.ts` says "The API ignores ?empId and returns every employee's rows". If `/worktime` also ignores `emp_id`/`work_date`, the first record in the database is overwritten by every clock-in.
- **Suggested fix:** `existing.find(r => String(r.emp_id) === String(payload.emp_id) && r.work_date?.split("T")[0] === payload.work_date)`. Also check whether the backend applies these filters.
- **Status:** Open

### BUG-007: The login token is sent to any host whose address starts like the API's
- **Severity:** Medium
- **Type:** Security
- **Location:** `src/lib/auth.ts`, `isApiUrl`
- **Found by:** `auth.test.ts` › "does not send the token to a host that only starts with the API address"
- **Steps / input:** API at `https://api.test`, then `fetch("https://api.test.evil.com/x")`.
- **Expected:** No `Authorization` header.
- **Actual:** `url.startsWith(origin)` matches, so the bearer token and the acting company id are sent to the other host. The hard-coded `http(s)://localhost:3001` origins also get the token in production.
- **Suggested fix:** Compare `new URL(url).origin === new URL(API_BASE_URL).origin`. Only allow the localhost origins in development.
- **Status:** Open

### BUG-009: A refused refresh token is sent a second time
- **Severity:** Medium (Low if the backend has no reuse detection)
- **Type:** Bug / Security
- **Location:** `src/lib/auth.ts`, `installAuthFetch` and `refreshTokens`
- **Found by:** `auth.test.ts` › "tries the refresh token only once when it is refused"
- **Steps / input:** The access token expires in under 30 s, so the early renewal runs and `/auth/refresh` answers 401. The request then goes out with the old token and gets `TOKEN_EXPIRED`.
- **Expected:** One refresh call, then sign-in.
- **Actual:** Two `/auth/refresh` calls with the same refresh token. With token rotation, reusing a refresh token often counts as theft and can end all of that user's sessions.
- **Suggested fix:** If the early renewal returns `false`, sign out (or skip the second refresh).
- **Status:** Open

### BUG-001: Date ranges start a day early in time zones behind UTC
- **Severity:** Medium (only for companies west of UTC)
- **Type:** Bug
- **Location:** `src/lib/reporting.ts`, `generateDateRange` (used by `fillMissingDates`)
- **Found by:** `reporting.test.ts` › "starts on the requested day in a time zone behind UTC"
- **Steps / input:** Time zone `America/New_York`, `generateDateRange("2026-03-01", "2026-03-02")`.
- **Expected:** `["2026-03-01", "2026-03-02"]`
- **Actual:** `["2026-02-28", "2026-03-01"]`. `new Date("YYYY-MM-DD")` is UTC midnight, but the loop reads local dates. This is the same kind of bug the file's own comment on `toLocalDateString` warns about. Correct in Algeria (UTC+1), but companies have a `utcOffset` setting.
- **Suggested fix:** Parse with `new Date(y, m - 1, d)` or `new Date(\`${start}T00:00:00\`)`.
- **Status:** Open

### BUG-003: Plans on the first day of a range are missed in time zones behind UTC
- **Severity:** Medium (only for companies west of UTC)
- **Type:** Bug
- **Location:** `src/lib/reporting.ts`, `fetchScheduledEmpIds`
- **Found by:** `reporting.test.ts` › "counts a plan on the first day of the range in a time zone behind UTC"
- **Steps / input:** Time zone `America/New_York`, plan `planDate: "2026-03-01T00:00:00.000Z"`, range March.
- **Expected:** Employee counted as scheduled.
- **Actual:** Not counted. The plan's UTC midnight is 19:00 on Feb 28 local time, which is outside the local range. Plans on the day after the range are counted instead.
- **Suggested fix:** Compare date strings: `r.planDate.split("T")[0]` between `range.start` and `range.end`.
- **Status:** Open

### BUG-012: A delete answered with "204 No Content" is reported as a failure
- **Severity:** Medium (depends on the backend; it may return JSON today)
- **Type:** Bug
- **Location:** `worktime.api.ts` `request()` (throws "Empty response"), `employee.api.ts` `request()` (`res.json()` on an empty body)
- **Found by:** `worktime.api.test.ts` and `employee.api.test.ts` › "treats an empty 204 delete as success"
- **Expected:** The delete succeeds.
- **Actual:** `[worktime] 204 - Empty response from /worktime/w1` / `SyntaxError: Unexpected end of JSON input`. The record is deleted, but the UI shows an error.
- **Suggested fix:** Use `fetchJson` from `src/lib/errors.ts`, which already handles empty bodies.
- **Status:** Open

### BUG-013: Worktime responses are printed to the browser console
- **Severity:** Low (privacy and noise)
- **Type:** Security / Cleanup
- **Location:** `src/components/tables/worktime.api.ts`, `request()` and `upsertWorktime`
- **Found by:** `worktime.api.test.ts` › "doesn't print response bodies to the console"
- **Actual:** Each call logs the path, method, status and full body (employee ids, hours, penalties). Upserts log the payload. Anyone at a shared kiosk can open DevTools and read them.
- **Suggested fix:** Remove the `console.log` calls, or only log when `process.env.NODE_ENV === "development"`.
- **Status:** Open

### BUG-014: Errors from `shifts.api.ts` and `worktime.api.ts` show raw server text
- **Severity:** Low
- **Type:** UX
- **Location:** `shifts.api.ts` (`[api] 400 …`), `worktime.api.ts` (`[worktime] 400 …`), with `friendlyError` in `src/lib/errors.ts`
- **Found by:** `shifts.api.test.ts` / `worktime.api.test.ts` › "its errors become readable messages"
- **Expected:** `friendlyError` shows the server's message, e.g. "Clock-out before clock-in".
- **Actual:** The prefix stops `friendlyError` from recognising the status, so people see `[worktime] 400 {"message":"Clock-out before clock-in"}`.
- **Suggested fix:** Use `ensureOk` / `fetchJson` (throws `ApiError`) like the other API files.
- **Status:** Open

### BUG-002: A company setting of 0 is ignored
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/lib/payrollConfig.ts`, `applyCompanySettings`
- **Found by:** `payrollConfig.test.ts` › "accepts a weekly advance ratio of 0"
- **Expected:** `weeklyAdvanceRatio: 0` turns weekly advances off.
- **Actual:** `if (settings.weeklyAdvanceRatio)` treats 0 as "not set", so the previous value stays. Because the config is one shared object, a super admin switching company keeps the previous company's value.
- **Suggested fix:** `if (settings.x !== undefined)`, and reset to defaults before applying a company's settings.
- **Status:** Open

### BUG-011: A manager or admin with no company can open the activity log
- **Severity:** Low (the backend should still refuse the data)
- **Type:** Bug / Security
- **Location:** `src/lib/auth.ts`, `canOpen`
- **Found by:** `auth.test.ts` › "a manager without a company can't open the activity log"
- **Actual:** The "no company" rule (`NO_COMPANY_PATHS`, meant for the super admin) is checked before the admin-only rule.
- **Suggested fix:** Only apply `NO_COMPANY_PATHS` to `superadmin`. Other roles without a company get `/account` and `/help` only.
- **Status:** Open

### BUG-008: A failed branding request is cached until the page is reloaded
- **Severity:** Low
- **Type:** UX
- **Location:** `src/lib/branding.ts`, `fetchBrand`
- **Found by:** `branding.test.ts` › "tries again after a network failure"
- **Actual:** A network error is cached as `null`, so the sign-in page keeps the default look until a full reload.
- **Suggested fix:** `cache.delete(slug)` in the `.catch`.
- **Status:** Open

### BUG-010: Downloading a file whose name contains "%" fails
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/lib/auth.ts`, `downloadFile`
- **Found by:** `auth.test.ts` › "accepts a filename containing %"
- **Actual:** `decodeURIComponent("100% sales.xlsx")` throws `URIError: URI malformed`, and the export fails.
- **Suggested fix:** Only decode the `filename*=` form, or wrap the decode in `try/catch`.
- **Status:** Open

### BUG-006: Non-numeric values become NaN in worktime rows
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/lib/reporting.ts`, `normalizeRow`
- **Found by:** `reporting.test.ts` › "never produces NaN for bad numeric fields"
- **Actual:** `Number("n/a")` is `NaN`, and one bad row turns every total (penalties, late minutes) into `NaN`.
- **Suggested fix:** A `toNumber(v)` helper returning 0 for non-finite values.
- **Status:** Open

### BUG-005: Negative durations are converted wrongly
- **Severity:** Low (only if the backend ever sends negative hours)
- **Type:** Bug
- **Location:** `src/lib/reporting.ts`, `timeToDecimalHours`
- **Found by:** `reporting.test.ts` › "converts a negative duration"
- **Actual:** `"-01:30"` → `-0.5` (should be `-1.5`). The minus sign only applies to the hours.
- **Status:** Open

### BUG-004: Date filters in the URL aren't validated
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/lib/rangeParams.ts`, `readRange`
- **Found by:** `rangeParams.test.ts` › "rejects values that are not YYYY-MM-DD dates"
- **Actual:** `?start=hello&end=2026-03-31` is accepted and sent to the API. A reversed range (`start > end`) is accepted too.
- **Suggested fix:** Check `/^\d{4}-\d{2}-\d{2}$/` and `start <= end`, else return `undefined`.
- **Status:** Open

## Observations (not bugs, to confirm)

- **`getLastWeekRange` returns the current Thursday-to-Wednesday week**, not the previous one. On a Thursday it returns today to next Wednesday. The tests record the current behaviour. Rename it or change it if "last week" was meant.
- **`.env` is committed.** It only holds `NEXT_PUBLIC_API_BASE_URL` today (public anyway), but tracked `.env` files tend to collect secrets later. Consider committing only `.env.example` and adding `.env` to `.gitignore`.
- **Existing lint errors** (`npm run lint`), not caused by the tests: `src/lib/reporting.ts:117` `prefer-const` (error), `src/lib/auth.ts:3` unused import `t` (warning).

## Fixed issues

(Move entries here with the fixing commit.)

## Coverage exclusions

| Path | Reason |
|------|--------|
| `src/test/**` | Test helpers |
| `src/**/*.test.{ts,tsx}` | The tests themselves |
| `src/**/*.d.ts` | Type declarations only |
| `src/lib/i18n/fr.ts`, `src/lib/i18n/ar.ts` | Static translation data. Covered by the key-match tests in `i18n.test.ts` (same keys, same `{placeholders}`, no empty values) |
| `src/**/__testutils__/**`, `src/**/*.fixtures.ts` | Test helpers (fake backends, factories) that live next to the tests using them |
| `src/components/calendar/types.ts` | Types plus two constants (`POSTS`, `SHIFTS`) nothing imports |
| 22 files, ~2,300 lines (list in `vitest.config.mts`): `ecommerce/*`, `videos/*`, `EditingDrawer/EditComponant.tsx`, `InputType/EmployeesInput.tsx`, `auth/SignUpForm.tsx`, `header/NotificationDropdown.tsx`, `common/ChartTab.tsx`, `form/Form.tsx`, `form/input/RadioSm.tsx`, `ui/avatar/AvatarText.tsx`, `hooks/useGoBack.ts`, `layout/SidebarWidget.tsx`, `types/employee.ts` | **Dead code**: nothing in the app imports them (checked by following every import from the pages). Template leftovers or abandoned work. Candidates for deletion; if any of them is meant to be used, remove it from the exclusion list and add tests |

## Tooling notes

| Change | Why |
|--------|-----|
| `@types/node` 20 → 22 | Vitest 5 needs it, and npm crashed resolving peers with 20. The machine runs Node 22. Types only, `tsc` passes |
| No `@vitejs/plugin-react` | Peer conflict. Vitest's built-in `oxc` JSX transform is used instead (`vitest.config.mts`) |
| MSW 3: `onUnhandledFrame: "error"` | Any request without a handler fails the test, so tests never reach a real backend |
| `vitest.config.mts` thresholds | Global: ≥ 90% lines/statements/functions, ≥ 85% branches. `src/lib/**`: ≥ 95% / 90%. `npm run coverage` (and CI) fails below these |
| `testTimeout: 20_000`, `asyncUtilTimeout: 4000` | Screen tests wait for debounced saves and several requests. The defaults (5 s, 1 s) timed out when the whole suite ran with coverage |
| `setup.ts` clears toasts and confirm dialogs after each test | They are module state in `src/lib/notify.ts`; a leftover toast could satisfy the next test's assertion |
| `.github/workflows/ci.yml` | Runs lint (non-blocking until the existing errors are fixed), type-check, tests with coverage gate, and build on every push to `main`/`dev` and on pull requests |

## Refactors made to enable testing

| File | Change |
|------|--------|
| None yet | |
