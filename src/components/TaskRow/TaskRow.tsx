import { useRef, useState } from "react";

const START_TIMES = ["07:00", "08:00", "09:00", "10:00", "14:00", "15:00"];
const END_TIMES   = ["12:00", "14:00", "16:00", "17:00", "18:00", "20:00"];

type Field = "start" | "end";

interface TaskRowProps {
  task: { id: string | number; startTime: string; endTime: string; label: string };
  onUpdate: (patch: { startTime?: string; endTime?: string; label?: string }) => void;
  onRemove: () => void;
}

function TaskRow({ task, onUpdate, onRemove }: TaskRowProps) {
  const [active, setActive] = useState<Field | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const pick = (f: Field, t: string) => {
    onUpdate(f === "start" ? { startTime: t } : { endTime: t });
    if (f === "start") endRef.current?.focus(); // jump to end time
    else setActive(null);
  };

  const inputCls =
    "h-9 w-24 rounded-md border border-gray-300 bg-transparent px-2 text-xs text-gray-800 placeholder:text-gray-400 dark:border-gray-700 dark:text-white/90 dark:[color-scheme:dark]";

  const chip = (f: Field, t: string) => (
    <button
      key={t}
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep input focus
      onClick={() => pick(f, t)}
      className={`w-full rounded-md border px-2 py-1 text-center text-xs ${
        (f === "start" ? task.startTime : task.endTime) === t
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-gray-300 text-gray-700 hover:bg-brand-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-brand-900/20"
      }`}
    >
      {t}
    </button>
  );

  return (
    <div
      ref={wrapRef}
      className="rounded-lg border border-gray-200 p-2 dark:border-gray-700"
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) setActive(null);
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={task.startTime}
          onFocus={() => setActive("start")}
          onChange={(e) => onUpdate({ startTime: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && setActive(null)}
          className={inputCls}
        />

        <span className="w-2 text-center text-xs text-gray-400">–</span>

        <input
          ref={endRef}
          type="time"
          value={task.endTime}
          onFocus={() => setActive("end")}
          onChange={(e) => onUpdate({ endTime: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && setActive(null)}
          className={inputCls}
        />

        <input
          type="text"
          value={task.label}
          placeholder="Task Name"
          onFocus={() => setActive(null)}
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

      {active && (
        <div className="mt-2 flex items-start gap-2">
          <div className={`grid w-24 grid-cols-1 gap-1 ${active === "start" ? "" : "opacity-50"}`}>
            {START_TIMES.map((t) => chip("start", t))}
          </div>
          <span className="w-2 text-center text-xs text-gray-400">–</span>
          <div className={`grid w-24 grid-cols-1 gap-1 ${active === "end" ? "" : "opacity-50"}`}>
            {END_TIMES.map((t) => chip("end", t))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskRow;