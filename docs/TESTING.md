# Writing tests

Vitest + Testing Library + MSW. Tests sit next to the file they test: `Foo.tsx` → `Foo.test.tsx`.

```
npm test                         # watch mode
npm run test:run                 # once
npm run coverage                 # once, with coverage → coverage/index.html
npx vitest run src/components/users                       # one folder
npx vitest run src/components/users --coverage \
  --coverage.include='src/components/users/**' \
  --coverage.reportsDirectory=coverage-users --coverage.reporter=text   # one folder's coverage
```

## Helpers (`src/test/`)

| File | What it gives you |
|------|-------------------|
| `render.tsx` | `renderWithProviders(ui, { user, company, url, params })`: renders inside the real Theme/Auth/I18n/Sidebar providers plus the toast and confirm host, signed in as an admin of "Test Pizza" with every feature (pass `user: null` for signed out). Returns `{ user }` (a `userEvent` instance) plus the usual render result. `answerConfirmDialog(true/false)` clicks a `confirmDialog` button. Re-exports everything from Testing Library. |
| `server.ts` | `server` (MSW) and `API` (`https://api.test`, the base URL the code calls). Add handlers per test: `server.use(http.get(\`${API}/employees\`, () => HttpResponse.json([...])))`. |
| `factories.ts` | `makeUser`, `makeCompany`, `makeRow` (worktime row), `makeJwt`, `ALL_FEATURES`. |
| `navigation.ts` | `router` (spies for `push`, `replace`, `back`…) and `setUrl(url, params)`. `next/navigation` is mocked with these everywhere. |
| `setup.ts` | Runs before every test file. It mocks `next/navigation`, `next/image`, `next/link`, `next/dynamic` (loads at once), `next/font/google`, `react-apexcharts` (renders `<div data-testid="chart" data-series=…>`) and jvectormap, and stubs `matchMedia`, `ResizeObserver`, `IntersectionObserver` and `scrollTo`. It clears storage, MSW handlers and the URL after each test. |

`.svg` imports render as `<svg data-icon="file-name">`.

## Rules

1. **Any request without an MSW handler fails the test.** Mock every endpoint the code calls, including ones fired on mount.
2. **Test behaviour, not implementation.** Find elements the way a user would (`getByRole`, `getByLabelText`, `getByText`), click with `user.click`, type with `user.type`, and check what the user sees and which requests were sent.
3. **When the code is wrong, don't bend the test.** Write the test for the correct behaviour, mark it `it.fails(...)`, put `// BUG-0XX: <one line>` on the line above, and add the entry to `docs/TEST_FINDINGS.md`.
4. **Don't change application code to make tests pass.** Fixes go in their own commits (`fix: BUG-0XX …`).
5. **Keep tests independent.** Module-level state (caches, "installed" flags) needs `vi.resetModules()` and a fresh `await import(...)`. Restore anything you replace on `window`.
6. **Silence expected console output** with `vi.spyOn(console, "error").mockImplementation(() => {})` in that test only.
7. **Time:** `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(...)` fixes "today" without freezing the timers MSW and React need. Restore with `vi.useRealTimers()`.
8. **Time zone:** set `process.env.TZ` inside the test and restore it after (see `generateDateRange` tests in `src/lib/reporting.test.ts`).
