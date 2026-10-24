// Every 30 minutes from 00:00 to 23:30
const HOURS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

interface TaskRowProps {
  task: { id: string | number; startTime: string; endTime: string; label: string };
  onUpdate: (patch: { startTime?: string; endTime?: string; label?: string }) => void;
  onRemove: () => void;
}

function TaskRow({ task, onUpdate, onRemove }: TaskRowProps) {
  const selectCls =
    "h-9 w-24 rounded-md border border-gray-300 bg-transparent px-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

  // keep a value that isn't on the 30-min grid (e.g. loaded "09:15") selectable
  const options = (value: string) =>
    value && !HOURS.includes(value) ? [value, ...HOURS].sort() : HOURS;

  const hourSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="" disabled>
        --:--
      </option>
      {options(value).map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );

  return (
    <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {hourSelect(task.startTime, (v) => onUpdate({ startTime: v }))}

        <span className="w-2 text-center text-xs text-gray-400">–</span>

        {hourSelect(task.endTime, (v) => onUpdate({ endTime: v }))}

        <input
          type="text"
          value={task.label}
          placeholder="Task Name"
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-transparent px-2 text-xs text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:text-white/90"
        />

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 px-1 text-xs text-red-400 hover:text-red-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default TaskRow;
