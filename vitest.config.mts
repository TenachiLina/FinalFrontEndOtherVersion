import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";

// The app imports .svg files as React components (@svgr/webpack in
// next.config.ts). In tests each one becomes a plain <svg> named after its file.
const svgAsComponent = (): Plugin => ({
  name: "svg-as-component",
  enforce: "pre",
  load(id) {
    if (!id.endsWith(".svg")) return null;
    const name = path.basename(id, ".svg");
    return `import { createElement } from "react";
export default function Svg(props) { return createElement("svg", { "data-icon": ${JSON.stringify(name)}, ...props }); }`;
  },
});

export default defineConfig({
  plugins: [svgAsComponent()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Read by src/lib/config.ts when it is first imported
    env: { NEXT_PUBLIC_API_BASE_URL: "https://api.test" },
    restoreMocks: true,
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Every exclusion is listed with its reason in docs/TEST_FINDINGS.md
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/lib/i18n/fr.ts",
        "src/lib/i18n/ar.ts",
        // Template leftovers nothing in the app imports (candidates for deletion)
        "src/components/EditingDrawer/EditComponant.tsx",
        "src/components/InputType/EmployeesInput.tsx",
        "src/components/auth/SignUpForm.tsx",
        "src/components/common/ChartTab.tsx",
        "src/components/ecommerce/**",
        "src/components/form/Form.tsx",
        "src/components/form/input/RadioSm.tsx",
        "src/components/header/NotificationDropdown.tsx",
        "src/components/ui/avatar/AvatarText.tsx",
        "src/components/videos/**",
        "src/hooks/useGoBack.ts",
        "src/layout/SidebarWidget.tsx",
        "src/types/employee.ts",
      ],
      reporter: ["text-summary", "html", "json-summary"],
      // Raised after each phase so coverage can only go up (see the plan)
      thresholds: {
        "src/lib/**": { lines: 95, functions: 95, branches: 90, statements: 95 },
      },
    },
  },
});
