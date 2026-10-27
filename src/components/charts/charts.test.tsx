import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@/test/render";
import BarChartOne from "./bar/BarChartOne";
import LineChartOne from "./line/LineChartOne";

// Local version of the global react-apexcharts stub that also keeps the
// options, so the tooltip formatter can be checked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- formatter options are read loosely in assertions
const chartProps = vi.hoisted(() => [] as { type?: string; options?: Record<string, any>; series?: unknown; height?: number }[]);
vi.mock("react-apexcharts", async () => {
  const { createElement } = await import("react");
  return {
    default: (props: (typeof chartProps)[number]) => {
      chartProps.push(props);
      return createElement("div", { "data-testid": "chart", "data-type": props.type, "data-series": JSON.stringify(props.series) });
    },
  };
});

const lastChart = () => chartProps[chartProps.length - 1];

describe("BarChartOne", () => {
  it("draws monthly sales as bars", async () => {
    render(<BarChartOne />);
    const chart = await screen.findByTestId("chart");
    expect(chart).toHaveAttribute("data-type", "bar");
    const series = JSON.parse(chart.getAttribute("data-series")!);
    expect(series).toHaveLength(1);
    expect(series[0].name).toBe("Sales");
    expect(series[0].data).toHaveLength(12);
    const { options, height } = lastChart();
    expect(height).toBe(180);
    expect(options!.xaxis.categories).toHaveLength(12);
    expect(options!.tooltip.y.formatter(385)).toBe("385");
  });
});

describe("LineChartOne", () => {
  it("draws sales and revenue as areas", async () => {
    render(<LineChartOne />);
    const chart = await screen.findByTestId("chart");
    expect(chart).toHaveAttribute("data-type", "area");
    const series = JSON.parse(chart.getAttribute("data-series")!);
    expect(series.map((s: { name: string }) => s.name)).toEqual(["Sales", "Revenue"]);
    expect(series.every((s: { data: number[] }) => s.data.length === 12)).toBe(true);
    expect(lastChart().height).toBe(310);
  });
});
