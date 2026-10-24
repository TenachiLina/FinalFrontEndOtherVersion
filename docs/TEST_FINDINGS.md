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

## Open issues

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

## Tooling notes

| Change | Why |
|--------|-----|
| `@types/node` 20 → 22 | Vitest 5 needs it, and npm crashed resolving peers with 20. The machine runs Node 22. Types only, `tsc` passes |
| No `@vitejs/plugin-react` | Peer conflict. Vitest's built-in `oxc` JSX transform is used instead (`vitest.config.mts`) |
| MSW 3: `onUnhandledFrame: "error"` | Any request without a handler fails the test, so tests never reach a real backend |
| `vitest.config.mts` thresholds | `src/lib/**` must stay ≥ 95% lines/functions/statements and ≥ 90% branches. Raise the global threshold after each phase |

## Refactors made to enable testing

| File | Change |
|------|--------|
| None yet | |
