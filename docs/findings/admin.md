# Test findings: admin screens, sign-in, kiosk, home and profile

Bugs found while testing `src/components/{companies,users,sessions,system-errors,activity,kiosk,user-profile,home}`,
`src/components/auth/{SignInForm,AuthBrandPanel}.tsx`, `src/components/header/UserDropdown.tsx`, the add-employee
form (`src/app/(admin)/(others-pages)/addEmployeeForm/page.tsx`) and the pages that host them.
Each bug has a test marked `it.fails(...)` with a `// BUG-6NN` comment above it. The test describes the
**correct** behaviour and currently fails.

## Open issues

Sorted by severity.

### BUG-605: Sign-in can redirect to another site through `?next=`
- **Severity:** Medium
- **Type:** Security (open redirect)
- **Location:** `src/components/auth/SignInForm.tsx`, `destinationFor`
- **Found by:** `SignInForm.test.tsx` › "doesn't follow ?next= to another site disguised with a backslash" / "… with a tab"
- **Steps / input:** Open `/signin?next=%2F%5Cevil.example` (i.e. `next=/\evil.example`) or `next=/%09/evil.example` (`/<tab>/evil.example`) and sign in.
- **Expected:** `router.replace` goes to an in-app page (`/home`).
- **Actual:** `router.replace("/\\evil.example")`. The check only refuses `//`, but URL parsers treat `/\` as `//` and drop tabs and newlines, so the target resolves to `https://evil.example/`. `canOpen` allows it because it isn't a known page. A phishing link to the real sign-in page can send people, just signed in, to a look-alike site.
- **Suggested fix:** Resolve the target and compare origins: `const url = new URL(next, window.location.origin); if (url.origin !== window.location.origin) …`, then use `url.pathname + url.search` (and run `canOpen` on `url.pathname`).
- **Status:** Open

### BUG-603: A kiosk account is stuck on "Loading…" when the company has clock-in switched off
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/components/kiosk/KioskView.tsx` (redirect effect), with `homePathFor` in `src/lib/auth.ts`
- **Found by:** `KioskView.test.tsx` › "doesn't leave a kiosk account stuck when clock-in is switched off"
- **Steps / input:** Signed in as a kiosk account (`role: "employee"`) of a company whose features don't include `clockin`; open `/kiosk`.
- **Expected:** A message that the kiosk is switched off, with a way to sign out (or a redirect to a page that can be opened).
- **Actual:** `canOpen("/kiosk")` is false, so the view redirects to `homePathFor(user, company)`, which is `/kiosk` for every kiosk account. The page "redirects" to itself and shows "Loading…" forever; there is no Sign out button on that screen, so the tablet is stuck until someone clears the browser.
- **Suggested fix:** When a kiosk account can't open `/kiosk`, show "The clock-in kiosk is switched off for this company" and a Sign out button instead of redirecting.
- **Status:** Open

### BUG-601: A cancelled password reset pre-fills the next user's new password
- **Severity:** Low
- **Type:** Bug / Security
- **Location:** `src/components/users/UsersView.tsx`, reset-password modal (`newPassword` is cleared only after a successful save)
- **Found by:** `UsersView.test.tsx` › "starts with an empty password for the next user after a cancelled reset"
- **Steps / input:** Users › **Reset password** on Mia, type `meant-for-mia`, **Cancel**. Then **Reset password** on Sam.
- **Expected:** The password field is empty.
- **Actual:** It still holds `meant-for-mia` (in clear text, the field is `type="text"`). One click on **Set password** gives Sam the password meant for Mia.
- **Suggested fix:** Clear `newPassword` whenever the dialog opens or closes (e.g. in `setResetFor` callers or an effect on `resetFor`).
- **Status:** Open

### BUG-602: Clicking "Next" right after the list loads jumps back to page 1
- **Severity:** Low
- **Type:** Bug
- **Location:** `src/components/system-errors/SystemErrorsView.tsx` and `src/components/activity/ActivityLogView.tsx`, the search-debounce effect
- **Found by:** `SystemErrorsView.test.tsx` and `ActivityLogView.test.tsx` › "stays on page 2 when Next is clicked right after the list loads"
- **Steps / input:** Open System errors (or Activity log) with more than 50 entries and click **Next** within 400 ms of the page opening.
- **Expected:** Page 2 stays shown.
- **Actual:** Page 2 shows, then the debounce timer started on mount fires and calls `setPage(1)` even though the search text hasn't changed, so the list jumps back to page 1.
- **Suggested fix:** Only reset the page when the search actually changes: `setFilters(f => f.search === search ? f : (setPage(1), { ...f, search }))`, or skip the effect on the first render.
- **Status:** Open

### BUG-604: The kiosk list's loading text isn't translated
- **Severity:** Low
- **Type:** i18n
- **Location:** `src/components/kiosk/KioskView.tsx`, `{loadingList && <p …>Loading…</p>}`
- **Found by:** `KioskView.test.tsx` › "shows the list's loading text in the kiosk's language"
- **Steps / input:** Language French, open the kiosk while the employee list is loading.
- **Expected:** "Chargement…"
- **Actual:** "Loading…" (the string isn't passed through `t()`; it is in `fr.ts`).
- **Suggested fix:** `{t("Loading…")}`.
- **Status:** Open

### BUG-606: The profile page shows a made-up person and its Save does nothing
- **Severity:** Low (the page isn't in the menu, but any signed-in admin or manager can open `/profile`)
- **Type:** Bug / Leftover template
- **Location:** `src/app/(admin)/(others-pages)/profile/page.tsx`, `src/components/user-profile/{UserMetaCard,UserInfoCard,UserAddressCard}.tsx`
- **Found by:** `UserProfileCards.test.tsx` › "Profile page › shows the signed-in user's own name and email" and "saves an edited first name"
- **Steps / input:** Signed in as "Mia Manager", open `/profile`; click **Edit**, change the first name, **Save Changes**.
- **Expected:** The page shows Mia's name and email; a saved change is kept.
- **Actual:** It shows the TailAdmin template's "Musharof Chowdhury", `randomuser@pimjo.com`, a phone number, an Arizona address, a tax ID and links to Pimjo's social accounts. **Save Changes** only runs `console.log("Saving changes...")` and closes the dialog. The page title is "Next.js Profile | TailAdmin".
- **Suggested fix:** Delete the route and the three cards (the account page already covers the password), or wire them to `useAuth()` and a real endpoint.
- **Status:** Open

## Observations

Things that look odd but that the tests can't prove wrong (or that depend on the backend):

- **Toasts leak between tests.** `src/lib/notify.ts` keeps toasts (and the confirm queue) in module state, and `src/test/setup.ts` doesn't clear them, so an error toast from one test is still on screen in the next one for up to 7 s. `findByRole("alert")` then finds several elements. My tests look up alerts by their text instead. Suggest resetting `notify` state in `setup.ts` (shared-helper change, not made).
- **First tests can exceed the 5 s timeout under coverage.** With `--coverage`, 14 workers and other suites running at the same time, the first test in a file (cold imports + `user.type`) sometimes took more than 5 s. All pass with `--testTimeout=20000`; consider a higher `testTimeout` in `vitest.config.mts` for coverage runs.
- **System errors shows the request body.** `ErrorDetails` prints `entry.body` as "Data sent". If the backend logs a failed `/auth/login` or `/users/:id/password` request without removing passwords, a super admin sees them in clear. The redaction must happen on the backend; worth confirming.
- **Resetting your own password from Users skips the current-password check.** The **Reset password** button is shown on your own row (`isMe`); the admin endpoint doesn't ask for the current password, unlike Account › Change password. Probably intended for admins, but it lets someone at an unlocked admin session change the password without knowing it.
- **No confirmation for disabling a user, ending one of your own sessions or "Sign out all other devices".** Deleting a user and ending another person's session do ask.
- **A manager changed to admin keeps their linked employee.** `UsersView` only shows the employee link for managers, but changing the role doesn't send `employeeId: null`, so the old link stays in the data.
- **`CompanySettingsForm` and `ChangePasswordForm` show array validation messages joined without a space** (`new Error(["a","b"])` → "a,b"), unlike `UsersView`/`CompaniesView` which join with ", ".
- **Table rows open with a click only.** In System errors and Activity log the expandable rows are `<tr onClick>` with `aria-expanded`, but they can't be focused or opened with the keyboard. The password eye toggle in `SignInForm` is a `<span onClick>` with no label.
- **Activity log translates recorded values.** `ChangeList` passes the before/after values through `t()`, so a value that happens to equal an English UI string (e.g. a task named "Delete") is shown translated.
- **Typed dates filter on every keystroke.** The From/To fields of System errors and Activity log call the API with partial dates (`from=2`, `from=20`, …) while someone types a date by hand.
- **The kiosk is open to admins and managers too** (`canOpen("/kiosk")` only needs the clock-in feature). That matches the "Exit kiosk" button, so it looks intended.
