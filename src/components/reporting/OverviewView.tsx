// "use client";
// import React from "react";
// import dynamic from "next/dynamic";
// import { ApexOptions } from "apexcharts";
// import SimpleRangePicker from "./SimpleRangePicker";
// import { useReportingOverview } from "@/hooks/useReportingOverview";

// const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

// const fmtDA = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency()}`;
// const fmtNum = (n: number, d = 1) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

// /** % change vs previous period, or null when there is nothing to compare with. */
// const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? null : ((cur - prev) / prev) * 100);

// const baseChart = { fontFamily: "Outfit, sans-serif", toolbar: { show: false } };

// const OverviewView: React.FC = () => {
//   const { range, setRange, previousRange, current: c, previous: p, trend, loading, error } = useReportingOverview();

//   const trendLabel = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[trend.granularity];
//   const xaxis = { categories: trend.categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { rotate: -45, hideOverlappingLabels: true } };

//   // ── Charts ────────────────────────────────────────────────────────────
//   const breakdownOptions: ApexOptions = {
//     chart: { ...baseChart, type: "donut" },
//     labels: ["Net payout", "Advances", "Consommation", "Penalties"],
//     colors: ["#10b981", "#465fff", "#f59e0b", "#ef4444"],
//     legend: { position: "bottom" },
//     dataLabels: { enabled: false },
//     plotOptions: { pie: { donut: { size: "68%" } } },
//     tooltip: { y: { formatter: (v: number) => fmtDA(v) } },
//   };
//   const breakdownSeries = [Math.max(0, c.net), c.advances, c.consommation, c.penalties];
//   const hasBreakdown = c.gross > 0;

//   const hoursOptions: ApexOptions = {
//     chart: { ...baseChart, type: "area", height: 280 },
//     colors: ["#465fff"],
//     stroke: { curve: "smooth", width: 2 },
//     fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } },
//     dataLabels: { enabled: false },
//     grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
//     xaxis,
//     tooltip: { y: { formatter: (v: number) => `${v} h` } },
//   };

//   const deductionsOptions: ApexOptions = {
//     chart: { ...baseChart, type: "bar", stacked: true, height: 280 },
//     colors: ["#f59e0b", "#ef4444"],
//     plotOptions: { bar: { columnWidth: "55%", borderRadius: 4 } },
//     legend: { position: "top", horizontalAlign: "left" },
//     dataLabels: { enabled: false },
//     grid: { yaxis: { lines: { show: true } } },
//     xaxis,
//     tooltip: { y: { formatter: (v: number) => fmtDA(v) } },
//   };

//   const attendanceOptions: ApexOptions = {
//     chart: { ...baseChart, type: "line", height: 280 },
//     colors: ["#f59e0b", "#ef4444"],
//     stroke: { curve: "straight", width: 2 },
//     markers: { size: 3 },
//     legend: { position: "top", horizontalAlign: "left" },
//     dataLabels: { enabled: false },
//     grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
//     xaxis,
//     yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => String(Math.round(v)) } },
//   };

//   const noTrend = trend.categories.length === 0;

//   return (
//     <div className="flex flex-col gap-6">
//       <div>
//         <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Reporting Overview</h1>
//         <p className="text-sm text-gray-500 dark:text-gray-400">
//           Company-wide statistics for the chosen period, compared with the previous one ({previousRange.start} →{" "}
//           {previousRange.end}).
//         </p>
//       </div>

//       <SimpleRangePicker range={range} onApply={setRange} />

//       {error && (
//         <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
//           {error}
//         </div>
//       )}
//       {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading overview…</div>}

//       {/* Payroll */}
//       <Section title="Payroll">
//         <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
//           <StatCard label="Hours Worked" value={`${fmtNum(c.hours)} h`} change={pctChange(c.hours, p.hours)} />
//           <StatCard label="Gross Payroll" value={fmtDA(c.gross)} change={pctChange(c.gross, p.gross)} />
//           <StatCard label="Net Payroll" value={fmtDA(c.net)} change={pctChange(c.net, p.net)} highlight />
//           <StatCard
//             label="Advances Given"
//             value={fmtDA(c.advances)}
//             sub={`${c.advancesCount} advance${c.advancesCount === 1 ? "" : "s"}`}
//             change={pctChange(c.advances, p.advances)}
//             higherIsBad
//           />
//           <StatCard label="Consommation" value={fmtDA(c.consommation)} change={pctChange(c.consommation, p.consommation)} higherIsBad />
//           <StatCard label="Penalties" value={fmtDA(c.penalties)} change={pctChange(c.penalties, p.penalties)} higherIsBad />
//         </div>
//       </Section>

//       {/* Attendance */}
//       <Section title="Attendance">
//         <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
//           <StatCard label="Late Rate" value={`${fmtNum(c.lateRate)}%`} sub={`${c.lateEvents} late events`} change={pctChange(c.lateRate, p.lateRate)} higherIsBad />
//           <StatCard label="Absence Rate" value={`${fmtNum(c.absenceRate)}%`} sub={`${c.absences} absences`} change={pctChange(c.absenceRate, p.absenceRate)} higherIsBad />
//           <StatCard label="Total Late Minutes" value={`${fmtNum(c.lateMinutes, 0)} min`} change={pctChange(c.lateMinutes, p.lateMinutes)} higherIsBad />
//           <StatCard label="Overtime" value={`${fmtNum(c.overtimeHours)} h`} change={pctChange(c.overtimeHours, p.overtimeHours)} />
//         </div>
//       </Section>

//       {/* Workforce */}
//       <Section title="Workforce">
//         <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
//           <StatCard label="Active Employees" value={`${c.activeEmployees}`} change={pctChange(c.activeEmployees, p.activeEmployees)} />
//           <StatCard label="Avg Hours / Employee" value={`${fmtNum(c.avgHoursPerEmployee)} h`} change={pctChange(c.avgHoursPerEmployee, p.avgHoursPerEmployee)} />
//         </div>
//       </Section>

//       {/* Charts */}
//       <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
//         <ChartCard title="Where the Gross Payroll Goes" className="lg:col-span-1">
//           {hasBreakdown ? (
//             <ReactApexChart options={breakdownOptions} series={breakdownSeries} type="donut" height={300} />
//           ) : (
//             <NoData />
//           )}
//         </ChartCard>

//         <ChartCard title={`${trendLabel} Hours Worked`} className="lg:col-span-2">
//           {!noTrend ? (
//             <ReactApexChart options={hoursOptions} series={[{ name: "Hours", data: trend.hours }]} type="area" height={280} />
//           ) : (
//             <NoData />
//           )}
//         </ChartCard>
//       </div>

//       <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
//         <ChartCard title={`${trendLabel} Deductions`}>
//           {!noTrend ? (
//             <ReactApexChart
//               options={deductionsOptions}
//               series={[
//                 { name: "Consommation", data: trend.consommation },
//                 { name: "Penalties", data: trend.penalties },
//               ]}
//               type="bar"
//               height={280}
//             />
//           ) : (
//             <NoData />
//           )}
//         </ChartCard>

//         <ChartCard title={`${trendLabel} Lateness & Absences`}>
//           {!noTrend ? (
//             <ReactApexChart
//               options={attendanceOptions}
//               series={[
//                 { name: "Late events", data: trend.lateEvents },
//                 { name: "Absences", data: trend.absences },
//               ]}
//               type="line"
//               height={280}
//             />
//           ) : (
//             <NoData />
//           )}
//         </ChartCard>
//       </div>
//     </div>
//   );
// };

// // ─────────────────────────────────────────────────────────────────────────
// // Small presentational pieces
// // ─────────────────────────────────────────────────────────────────────────

// const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
//   <div className="flex flex-col gap-3">
//     <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h2>
//     {children}
//   </div>
// );

// const ChartCard: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className = "", children }) => (
//   <div className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
//     <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white">{title}</h3>
//     {children}
//   </div>
// );

// const NoData: React.FC = () => <div className="py-16 text-center text-sm text-gray-400">No data for this period</div>;

// const ChangeBadge: React.FC<{ change: number | null; higherIsBad?: boolean }> = ({ change, higherIsBad }) => {
//   if (change === null) return <span className="text-xs text-gray-400">no previous data</span>;
//   if (Math.abs(change) < 0.05) return <span className="text-xs text-gray-400">no change vs previous</span>;
//   const up = change > 0;
//   const good = higherIsBad ? !up : up;
//   return (
//     <span className={`text-xs font-semibold ${good ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
//       {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%{" "}
//       <span className="font-normal text-gray-400">vs previous</span>
//     </span>
//   );
// };

// const StatCard: React.FC<{
//   label: string;
//   value: string;
//   sub?: string;
//   change: number | null;
//   higherIsBad?: boolean;
//   highlight?: boolean;
// }> = ({ label, value, sub, change, higherIsBad, highlight }) => (
//   <div
//     className={`rounded-2xl border p-5 ${
//       highlight
//         ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-500/10"
//         : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
//     }`}
//   >
//     <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
//     <div className={`mt-1 text-xl font-bold ${highlight ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-white"}`}>
//       {value}
//     </div>
//     {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
//     <div className="mt-2">
//       <ChangeBadge change={change} higherIsBad={higherIsBad} />
//     </div>
//   </div>
// );

// export default OverviewView;
"use client";
import React from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import SimpleRangePicker from "./SimpleRangePicker";
import { useReportingOverview } from "@/hooks/useReportingOverview";

import { currency } from "@/lib/payrollConfig";
const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const fmtDA = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency()}`;
const fmtNum = (n: number, d = 1) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

/** % change vs previous period, or null when there is nothing to compare with. */
const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? null : ((cur - prev) / prev) * 100);

const baseChart = { fontFamily: "Outfit, sans-serif", toolbar: { show: false } };

const OverviewView: React.FC = () => {
  const { range, setRange, previousRange, current: c, previous: p, trend, loading, error } = useReportingOverview();

  const trendLabel = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[trend.granularity];
  const xaxis = { categories: trend.categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { rotate: -45, hideOverlappingLabels: true } };

  // ── Charts ────────────────────────────────────────────────────────────
  const breakdownOptions: ApexOptions = {
    chart: { ...baseChart, type: "donut" },
    labels: ["Net payout", "Advances", "Consommation", "Penalties"],
    colors: ["#10b981", "#465fff", "#f59e0b", "#ef4444"],
    legend: { position: "bottom" },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "68%" } } },
    tooltip: { y: { formatter: (v: number) => fmtDA(v) } },
  };
  const breakdownSeries = [Math.max(0, c.net), c.advances, c.consommation, c.penalties];
  const hasBreakdown = c.gross > 0;

  const hoursOptions: ApexOptions = {
    chart: { ...baseChart, type: "area", height: 280 },
    colors: ["#465fff"],
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } },
    dataLabels: { enabled: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis,
    tooltip: { y: { formatter: (v: number) => `${v} h` } },
  };

  const deductionsOptions: ApexOptions = {
    chart: { ...baseChart, type: "bar", stacked: true, height: 280 },
    colors: ["#f59e0b", "#ef4444"],
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 4 } },
    legend: { position: "top", horizontalAlign: "left" },
    dataLabels: { enabled: false },
    grid: { yaxis: { lines: { show: true } } },
    xaxis,
    tooltip: { y: { formatter: (v: number) => fmtDA(v) } },
  };

  const attendanceOptions: ApexOptions = {
    chart: { ...baseChart, type: "line", height: 280 },
    colors: ["#f59e0b", "#ef4444"],
    stroke: { curve: "straight", width: 2 },
    markers: { size: 3 },
    legend: { position: "top", horizontalAlign: "left" },
    dataLabels: { enabled: false },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    xaxis,
    yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => String(Math.round(v)) } },
  };

  const noTrend = trend.categories.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Reporting Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Company-wide statistics for the chosen period, compared with the previous one ({previousRange.start} →{" "}
          {previousRange.end}).
        </p>
      </div>

      <SimpleRangePicker range={range} onApply={setRange} />

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-gray-500 dark:text-gray-400">Loading overview…</div>}

      {/* Payroll */}
      <Section title="Payroll">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Hours Worked" value={`${fmtNum(c.hours)} h`} change={pctChange(c.hours, p.hours)} />
          <StatCard label="Gross Payroll" value={fmtDA(c.gross)} change={pctChange(c.gross, p.gross)} />
          <StatCard label="Net Payroll" value={fmtDA(c.net)} change={pctChange(c.net, p.net)} highlight />
          <StatCard
            label="Advances Given"
            value={fmtDA(c.advances)}
            sub={`${c.advancesCount} advance${c.advancesCount === 1 ? "" : "s"}`}
            change={pctChange(c.advances, p.advances)}
            higherIsBad
          />
          <StatCard
            label="Primes Given"
            value={fmtDA(c.bonuses)}
            sub={`${c.bonusesCount} prime${c.bonusesCount === 1 ? "" : "s"}`}
            change={pctChange(c.bonuses, p.bonuses)}
          />
          <StatCard label="Consommation" value={fmtDA(c.consommation)} change={pctChange(c.consommation, p.consommation)} higherIsBad />
          <StatCard label="Penalties" value={fmtDA(c.penalties)} change={pctChange(c.penalties, p.penalties)} higherIsBad />
        </div>
      </Section>

      {/* Attendance */}
      <Section title="Attendance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Late Rate" value={`${fmtNum(c.lateRate)}%`} sub={`${c.lateEvents} late events`} change={pctChange(c.lateRate, p.lateRate)} higherIsBad />
          <StatCard label="Absence Rate" value={`${fmtNum(c.absenceRate)}%`} sub={`${c.absences} absences`} change={pctChange(c.absenceRate, p.absenceRate)} higherIsBad />
          <StatCard label="Total Late Minutes" value={`${fmtNum(c.lateMinutes, 0)} min`} change={pctChange(c.lateMinutes, p.lateMinutes)} higherIsBad />
          <StatCard label="Overtime" value={`${fmtNum(c.overtimeHours)} h`} change={pctChange(c.overtimeHours, p.overtimeHours)} />
        </div>
      </Section>

      {/* Workforce */}
      <Section title="Workforce">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Active Employees" value={`${c.activeEmployees}`} change={pctChange(c.activeEmployees, p.activeEmployees)} />
          <StatCard label="Avg Hours / Employee" value={`${fmtNum(c.avgHoursPerEmployee)} h`} change={pctChange(c.avgHoursPerEmployee, p.avgHoursPerEmployee)} />
        </div>
      </Section>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Where the Payroll Goes" className="lg:col-span-1">
          {hasBreakdown ? (
            <ReactApexChart options={breakdownOptions} series={breakdownSeries} type="donut" height={300} />
          ) : (
            <NoData />
          )}
        </ChartCard>

        <ChartCard title={`${trendLabel} Hours Worked`} className="lg:col-span-2">
          {!noTrend ? (
            <ReactApexChart options={hoursOptions} series={[{ name: "Hours", data: trend.hours }]} type="area" height={280} />
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title={`${trendLabel} Deductions`}>
          {!noTrend ? (
            <ReactApexChart
              options={deductionsOptions}
              series={[
                { name: "Consommation", data: trend.consommation },
                { name: "Penalties", data: trend.penalties },
              ]}
              type="bar"
              height={280}
            />
          ) : (
            <NoData />
          )}
        </ChartCard>

        <ChartCard title={`${trendLabel} Lateness & Absences`}>
          {!noTrend ? (
            <ReactApexChart
              options={attendanceOptions}
              series={[
                { name: "Late events", data: trend.lateEvents },
                { name: "Absences", data: trend.absences },
              ]}
              type="line"
              height={280}
            />
          ) : (
            <NoData />
          )}
        </ChartCard>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Small presentational pieces
// ─────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-3">
    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h2>
    {children}
  </div>
);

const ChartCard: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({ title, className = "", children }) => (
  <div className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
    <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white">{title}</h3>
    {children}
  </div>
);

const NoData: React.FC = () => <div className="py-16 text-center text-sm text-gray-400">No data for this period</div>;

const ChangeBadge: React.FC<{ change: number | null; higherIsBad?: boolean }> = ({ change, higherIsBad }) => {
  if (change === null) return <span className="text-xs text-gray-400">no previous data</span>;
  if (Math.abs(change) < 0.05) return <span className="text-xs text-gray-400">no change vs previous</span>;
  const up = change > 0;
  const good = higherIsBad ? !up : up;
  return (
    <span className={`text-xs font-semibold ${good ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%{" "}
      <span className="font-normal text-gray-400">vs previous</span>
    </span>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  change: number | null;
  higherIsBad?: boolean;
  highlight?: boolean;
}> = ({ label, value, sub, change, higherIsBad, highlight }) => (
  <div
    className={`rounded-2xl border p-5 ${
      highlight
        ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-500/10"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    }`}
  >
    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    <div className={`mt-1 text-xl font-bold ${highlight ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-white"}`}>
      {value}
    </div>
    {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    <div className="mt-2">
      <ChangeBadge change={change} higherIsBad={higherIsBad} />
    </div>
  </div>
);

export default OverviewView;