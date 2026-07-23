"use client";
import React from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import SimpleRangePicker from "./SimpleRangePicker";
import { useReportingOverview } from "@/hooks/useReportingOverview";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const OverviewView: React.FC = () => {
  const { range, setRange, stats, hoursPerEmployeeChart, netSalaryPerEmployeeChart, dailyTrendChart, loading, error } =
    useReportingOverview();

  const hoursPerEmployeeOptions: ApexOptions = {
    colors: ["#465fff"],
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 260, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: "45%", borderRadius: 5, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: { categories: hoursPerEmployeeChart.categories, axisBorder: { show: false }, axisTicks: { show: false } },
    grid: { yaxis: { lines: { show: true } } },
    fill: { opacity: 1 },
    tooltip: { y: { formatter: (val: number) => `${val} h` } },
  };

  const netSalaryPerEmployeeOptions: ApexOptions = {
    colors: ["#10b981"],
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 260, toolbar: { show: false } },
    plotOptions: { bar: { columnWidth: "45%", borderRadius: 5, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: { categories: netSalaryPerEmployeeChart.categories, axisBorder: { show: false }, axisTicks: { show: false } },
    grid: { yaxis: { lines: { show: true } } },
    fill: { opacity: 1 },
    tooltip: { y: { formatter: (val: number) => `${val} DA` } },
  };

  const dailyTrendOptions: ApexOptions = {
    legend: { show: true, position: "top", horizontalAlign: "left" },
    colors: ["#465FFF", "#F59E0B", "#EF4444"],
    chart: { fontFamily: "Outfit, sans-serif", height: 300, type: "line", toolbar: { show: false } },
    stroke: { curve: "straight", width: [2, 2, 2] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } },
    markers: { size: 0, hover: { size: 5 } },
    dataLabels: { enabled: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis: { categories: dailyTrendChart.categories, axisBorder: { show: false }, axisTicks: { show: false } },
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Reporting Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Charts and statistics for a chosen period.</p>
      </div>

      <SimpleRangePicker range={range} onApply={setRange} />

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading overview…</div>}

      {/* Headline stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hours Worked" value={`${stats.totalHoursWorked} h`} />
        <StatCard label="Net Salary (Period)" value={`${stats.totalNetPayroll} DA`} />
        <StatCard
          label="Absences"
          value={`${stats.totalAbsences}`}
          tone={stats.totalAbsences > 0 ? "warning" : "default"}
        />
        <StatCard label="Active Advances" value={`${stats.activeAdvancesCount}`} />
      </div>

      {/* Chart 1: hours per employee */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white">Hours per Employee</h3>
        {hoursPerEmployeeChart.categories.length > 0 ? (
          <ReactApexChart
            options={hoursPerEmployeeOptions}
            series={[{ name: "Hours", data: hoursPerEmployeeChart.series }]}
            type="bar"
            height={260}
          />
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">No data yet</div>
        )}
      </div>

      {/* Chart 1b: net salary per employee */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white">Net Salary per Employee</h3>
        {netSalaryPerEmployeeChart.categories.length > 0 ? (
          <ReactApexChart
            options={netSalaryPerEmployeeOptions}
            series={[{ name: "Net Salary", data: netSalaryPerEmployeeChart.series }]}
            type="bar"
            height={260}
          />
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">No data yet</div>
        )}
      </div>

      {/* Chart 2: daily trend across the period */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white">Daily Trend</h3>
        {dailyTrendChart.categories.length > 0 ? (
          <ReactApexChart
            options={dailyTrendOptions}
            series={[
              { name: "Hours", data: dailyTrendChart.hoursSeries },
              { name: "Penalties (DA)", data: dailyTrendChart.penaltySeries },
              { name: "Consommation (DA)", data: dailyTrendChart.consommationSeries },
            ]}
            type="line"
            height={300}
          />
        ) : (
          <div className="py-10 text-center text-sm text-gray-400">No data yet</div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; tone?: "default" | "warning" }> = ({
  label,
  value,
  tone = "default",
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center dark:border-gray-800 dark:bg-white/[0.03]">
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div
      className={`mt-1 text-xl font-bold ${
        tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-white"
      }`}
    >
      {value}
    </div>
  </div>
);

export default OverviewView;