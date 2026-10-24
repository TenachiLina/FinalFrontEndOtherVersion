# Test findings: shared UI, forms, common components, help, template pages

Bugs found while testing `src/components/{ui,form,common,charts,example,help}`, `src/layout/AppHeader.tsx`,
`src/layout/Backdrop.tsx`, `src/hooks/useModal.ts`, `src/icons` and the simple pages under `src/app`.
Each bug has a test marked `it.fails(...)` with a `// BUG-7NN` comment above it. The test describes the
**correct** behaviour and currently fails.

## Open issues

Sorted by severity.

### BUG-708: "Close" in a modal form submits the form
- **Severity:** Medium
- **Type:** Bug
- **Location:** `src/components/ui/button/Button.tsx` (no `type` prop, so it's always a submit button); seen in `src/components/example/ModalExample/FormInModal.tsx`, the same pattern is in `src/components/user-profile/UserInfoCard.tsx`
- **Found by:** `modals.test.tsx` › "FormInModal › doesn't submit the form when Close is clicked"
- **Steps / input:** Open the "Form In Modal" example, click **Close** (or **Save Changes**).
- **Expected:** The modal closes; the form isn't submitted.
- **Actual:** A `submit` event is fired on the `<form>`. With no `onSubmit` handler the browser submits the form, i.e. reloads the page with the fields in the URL. `Button` can't be made `type="button"` because it doesn't accept or forward `type`.
- **Suggested fix:** Add `type?: "button" | "submit" | "reset"` to `Button` and pass it to the `<button>`. Use `type="button"` for Close/Cancel buttons inside forms (forms that rely on `Button` submitting keep working if the default stays `submit`, or pass `type="submit"` explicitly there).
- **Status:** Open

### BUG-701: The Modal's close button has no accessible name
- **Severity:** Medium
- **Type:** Accessibility
- **Location:** `src/components/ui/modal/index.tsx`, close `<button>`
- **Found by:** `ui.test.tsx` › "Modal › gives the close button an accessible name"
- **Steps / input:** Open any modal that uses `<Modal>` (users, companies, planning, advances, bonuses…) with a screen reader.
- **Expected:** The ✕ button is announced as "Close".
- **Actual:** It only contains an SVG, so it's announced as "button".
- **Suggested fix:** `aria-label={t("Close")}` on the button (and `aria-hidden` on the SVG).
- **Status:** Open

### BUG-702: The Modal isn't exposed as a dialog
- **Severity:** Medium
- **Type:** Accessibility
- **Location:** `src/components/ui/modal/index.tsx`
- **Found by:** `ui.test.tsx` › "Modal › is announced as a modal dialog"
- **Steps / input:** Open any modal.
- **Expected:** An element with `role="dialog"` and `aria-modal="true"` (ideally labelled by its heading), so assistive tech knows a dialog opened and ignores the page behind it.
- **Actual:** Plain `<div>`s; screen readers can still wander into the page underneath and aren't told a dialog opened. (Focus also isn't moved into the modal.)
- **Suggested fix:** Put `role="dialog" aria-modal="true"` on the content box, accept an `aria-labelledby`/`title` prop, and move focus into it on open.
- **Status:** Open

### BUG-711: The theme toggle buttons have no accessible name
- **Severity:** Low
- **Type:** Accessibility
- **Location:** `src/components/common/ThemeToggleButton.tsx` (header on every page), `src/components/common/ThemeTogglerTwo.tsx`
- **Found by:** `common.test.tsx` › "ThemeToggleButton › has an accessible name", "ThemeTogglerTwo › has an accessible name"
- **Steps / input:** Tab to the moon/sun button in the header with a screen reader.
- **Expected:** "Switch to dark mode" / "Switch to light mode" (or "Toggle theme").
- **Actual:** Icon-only `<button>` with no label: announced as "button".
- **Suggested fix:** `aria-label={t(theme === "dark" ? "Switch to light mode" : "Switch to dark mode")}`.
- **Status:** Open

### BUG-713: The header's "more" button on phones has no name or state
- **Severity:** Low
- **Type:** Accessibility
- **Location:** `src/layout/AppHeader.tsx`, the ⋯ button that toggles `isApplicationMenuOpen`
- **Found by:** `AppHeader.test.tsx` › "labels the application menu button"
- **Steps / input:** On a phone-sized screen, reach the ⋯ button that shows the theme/language/user controls.
- **Expected:** A name (e.g. "More options") and `aria-expanded` reflecting whether the menu is shown.
- **Actual:** Icon-only, no label, no `aria-expanded`.
- **Suggested fix:** `aria-label={t("More options")} aria-expanded={isApplicationMenuOpen}`.
- **Status:** Open

### BUG-712: Tooltips can't be seen with the keyboard
- **Severity:** Low
- **Type:** Accessibility
- **Location:** `src/components/common/Tooltip.tsx` (used in the planning and shifts pages)
- **Found by:** `common.test.tsx` › "Tooltip › shows the text when the element gets keyboard focus"
- **Steps / input:** Tab to an element wrapped in `<Tooltip>`.
- **Expected:** The tooltip text appears on focus (and is linked with `aria-describedby` / `role="tooltip"`).
- **Actual:** Only `onMouseEnter`/`onMouseLeave` are handled, so keyboard and touch users never get the text.
- **Suggested fix:** Also show on `onFocus` and hide on `onBlur` (focus events bubble in React), give the bubble `role="tooltip"` and an id referenced by `aria-describedby`.
- **Status:** Open

### BUG-710: The language menu can't be closed with Escape
- **Severity:** Low
- **Type:** Accessibility
- **Location:** `src/components/common/LanguageSwitcher.tsx` / `src/components/ui/dropdown/Dropdown.tsx`
- **Found by:** `common.test.tsx` › "LanguageSwitcher › closes on Escape"
- **Steps / input:** Open the language menu, press Escape.
- **Expected:** The list closes (expected behaviour for an `aria-haspopup="listbox"` popup).
- **Actual:** It stays open; `Dropdown` only closes on an outside mouse click.
- **Suggested fix:** Listen for `keydown` Escape in `Dropdown` (only while open) and call `onClose`; return focus to the toggle.
- **Status:** Open

### BUG-706: Switch can't be used with the keyboard
- **Severity:** Low (only used on the form-elements example page)
- **Type:** Accessibility
- **Location:** `src/components/form/switch/Switch.tsx`
- **Found by:** `inputs.test.tsx` › "Switch › can be toggled with the keyboard"
- **Steps / input:** Tab to a switch and press Space.
- **Expected:** It receives focus, is announced as a switch with its label and on/off state, and toggles.
- **Actual:** It's a `<label>` with `onClick` and two `<div>`s: nothing focusable, no role, no state.
- **Suggested fix:** Render `<button role="switch" aria-checked={isChecked}>` (or a visually hidden checkbox inside the label) and drop the label `onClick`.
- **Status:** Open

### BUG-703: MultiSelect's arrow button never opens the list
- **Severity:** Low (only used on the form-elements example page)
- **Type:** Bug
- **Location:** `src/components/form/MultiSelect.tsx`, chevron `<button onClick={toggleDropdown}>` inside `<div onClick={toggleDropdown}>`
- **Found by:** `inputs.test.tsx` › "MultiSelect › opens the list with the arrow button"
- **Steps / input:** Click the ▾ button.
- **Expected:** The option list opens.
- **Actual:** The click toggles twice (button, then the field it bubbles to), so nothing happens.
- **Suggested fix:** Remove the button's own `onClick`, or call `e.stopPropagation()` in it.
- **Status:** Open

### BUG-704: Removing a MultiSelect chip opens the option list
- **Severity:** Low (only used on the form-elements example page)
- **Type:** Bug
- **Location:** `src/components/form/MultiSelect.tsx`, chip ✕ `onClick`
- **Found by:** `inputs.test.tsx` › "MultiSelect › doesn't open the list when a chip is removed"
- **Steps / input:** With options selected and the list closed, click a chip's ✕.
- **Expected:** The chip is removed; the list stays closed.
- **Actual:** The click bubbles to the field's `toggleDropdown`, so the list opens (or closes if it was open).
- **Suggested fix:** `e.stopPropagation()` in the ✕ handler.
- **Status:** Open

### BUG-705: A disabled MultiSelect still lets you remove options
- **Severity:** Low (only used on the form-elements example page)
- **Type:** Bug
- **Location:** `src/components/form/MultiSelect.tsx`, `removeOption`
- **Found by:** `inputs.test.tsx` › "MultiSelect › doesn't let a disabled field be changed"
- **Steps / input:** `<MultiSelect disabled defaultSelected={["1"]} onChange={fn} />`, click the chip's ✕.
- **Expected:** Nothing changes; `onChange` isn't called.
- **Actual:** The option is removed and `onChange([])` is called. `disabled` only blocks opening the list.
- **Suggested fix:** Return early from `removeOption` (and `handleSelect`) when `disabled`, and hide the ✕.
- **Status:** Open

### BUG-707: PhoneInput always starts on the US prefix
- **Severity:** Low (only used on the form-elements example page)
- **Type:** Bug
- **Location:** `src/components/form/group-input/PhoneInput.tsx`, initial state `"US"` / `"+1"`
- **Found by:** `inputs.test.tsx` › "PhoneInput › starts on the first listed country's prefix"
- **Steps / input:** `<PhoneInput countries={[{ code: "DZ", label: "+213" }, { code: "FR", label: "+33" }]} />`
- **Expected:** The select shows DZ and the number starts with `+213`.
- **Actual:** The select shows DZ (the browser falls back to the first option) but the field contains `+1`, a prefix that isn't in the list.
- **Suggested fix:** Initialise from `countries[0]` (or a `defaultCountry` prop).
- **Status:** Open

### BUG-709: "Okay, Got It" doesn't close the alert modals
- **Severity:** Low (template example page)
- **Type:** Bug
- **Location:** `src/components/example/ModalExample/ModalBasedAlerts.tsx`, the four "Okay, Got It" buttons
- **Found by:** `modals.test.tsx` › "ModalBasedAlerts › closes the alert with Okay, Got It"
- **Steps / input:** Open "Success Alert", click "Okay, Got It".
- **Expected:** The modal closes.
- **Actual:** The buttons have no `onClick`; nothing happens.
- **Suggested fix:** `onClick={successModal.closeModal}` (and the same for the other three).
- **Status:** Open

## Observations (not bugs, to confirm)

- **Ctrl+K / ⌘+K is swallowed in the header.** `AppHeader` calls `preventDefault()` for Ctrl/⌘+K to focus a search input that is commented out, so the browser's own shortcut is blocked and nothing happens. `AppHeader.test.tsx` records the current behaviour. Remove the listener or bring back the search box.
- **Header titles are missing for some pages.** `/activity-log`, `/login-sessions`, `/system-errors` and `/reporting/employee/[id]` fall back to "Nexo InOuty".
- **`Dropdown` listens to every mousedown even while closed** and calls `onClose` each time. Harmless with `setIsOpen(false)`, but wasteful and surprising for other `onClose` handlers.
- **`MultiSelect` ignores `options[].selected`**, has no outside-click close and no keyboard support.
- **`Checkbox` draws a grey tick when disabled even if unchecked** (both ticks are drawn when disabled and checked), so a disabled unchecked box looks checked.
- **`DateInput`**: the month arrows are only labelled "‹"/"›"; typed dates aren't checked against `min`/`max` (only the calendar enforces them).
- **`TimeSelect` with `minuteStep={0}`** would throw (`Array.from({ length: Infinity })`); no caller does this today.
- **`not-found.tsx` and `error-404/page.tsx` are identical and not translated** (English text, no `t()`).
- **Template leftovers**: the ui-elements/chart/form/blank example pages still carry "TailAdmin" page titles, the form page breadcrumb says "From Elements", `FormInModal` labels the email field "Last Name", and the example `Label`s have no `htmlFor`, so their fields have no accessible name. These pages aren't linked from the sidebar; consider deleting them.
- **jsdom prints "Not implemented: HTMLFormElement's requestSubmit()"** when the FormInModal tests click its buttons; that is BUG-708 showing up, not a test problem.
