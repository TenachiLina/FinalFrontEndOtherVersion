import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@/test/render";
import * as icons from "./index";

describe("icons", () => {
  const entries = Object.entries(icons) as [string, React.ComponentType<React.SVGProps<SVGSVGElement>>][];

  it("exports every icon the app uses", () => {
    expect(entries.length).toBe(53);
    for (const name of ["PlusIcon", "ChevronDownIcon", "EyeIcon", "EyeCloseIcon", "TimeIcon", "CalenderIcon", "EnvelopeIcon", "BoxIcon"]) {
      expect(icons).toHaveProperty(name);
    }
  });

  it.each(Object.keys(icons))("%s renders an svg and passes props through", (name) => {
    const Icon = (icons as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>)[name];
    const { container } = render(<Icon className="size-6" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("size-6");
  });
});
