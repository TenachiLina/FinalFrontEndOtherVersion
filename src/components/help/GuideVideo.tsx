"use client";

import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { t } from "@/lib/i18n";
import { DESIGN_H, DESIGN_W, Scene, SceneState, SceneStage } from "./scenes";

// ─── Timeline ────────────────────────────────────────────────────────────────
// Everything on screen is a pure function of (step, elapsed ms), so pausing,
// resuming and jumping between steps never leave the animation half-done.

const ENTER = 500; // scene appears
const MOVE = 900; // cursor glides to the target
const CLICK = 350; // click ripple
const TYPE_CHAR = 70; // per typed character
const SETTLE = 350;
const MIN_HOLD = 1600; // reading time after the last action

interface ActionTiming {
  moveAt: number;
  clickAt: number;
  end: number;
}

function timingsOf(scene: Scene): ActionTiming[] {
  let at = ENTER;
  return scene.actions.map((a) => {
    const moveAt = at;
    const clickAt = moveAt + MOVE;
    const end = clickAt + CLICK + (a.type ? a.type.length * TYPE_CHAR : 0) + SETTLE;
    at = end;
    return { moveAt, clickAt, end };
  });
}

function durationOf(scene: Scene, caption: string) {
  const timings = timingsOf(scene);
  const last = timings.length ? timings[timings.length - 1].end : ENTER;
  return last + Math.max(MIN_HOLD, caption.length * 32);
}

function stateAt(scene: Scene, elapsed: number): SceneState & { cursorIndex: number; rippleIndex: number } {
  const timings = timingsOf(scene);
  const flags = new Set(scene.flags ?? []);
  const typed: Record<string, string> = {};
  let active: string | null = null;
  let cursorIndex = -1;
  let rippleIndex = -1;
  scene.actions.forEach((a, i) => {
    const tm = timings[i];
    if (elapsed >= tm.moveAt) cursorIndex = i;
    if (elapsed < tm.clickAt) return;
    active = a.target;
    if (elapsed < tm.clickAt + CLICK + 150) rippleIndex = i;
    if (a.sets) a.sets.split(" ").forEach((f) => flags.add(f));
    if (a.type) {
      const chars = Math.floor((elapsed - tm.clickAt - CLICK) / TYPE_CHAR);
      typed[a.target] = a.type.slice(0, Math.max(0, Math.min(a.type.length, chars)));
    }
  });
  return { flags, typed, active, menu: scene.menu ?? null, cursorIndex, rippleIndex };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

// ─── Player ──────────────────────────────────────────────────────────────────

interface Playback {
  step: number;
  elapsed: number;
  playing: boolean;
  started: boolean;
  ended: boolean;
}

type PlaybackAction =
  | { type: "tick"; dt: number; durations: number[] }
  | { type: "goTo"; step: number; count: number; play?: boolean }
  | { type: "toggle" };

function playback(state: Playback, action: PlaybackAction): Playback {
  switch (action.type) {
    case "tick": {
      if (!state.playing) return state;
      const elapsed = state.elapsed + action.dt;
      if (elapsed < action.durations[state.step]) return { ...state, elapsed };
      if (state.step < action.durations.length - 1) return { ...state, step: state.step + 1, elapsed: 0 };
      return { ...state, elapsed: action.durations[state.step], playing: false, ended: true };
    }
    case "goTo":
      return {
        step: Math.max(0, Math.min(action.count - 1, action.step)),
        elapsed: 0,
        started: true,
        ended: false,
        playing: action.play ?? state.playing,
      };
    case "toggle":
      if (state.ended) return { step: 0, elapsed: 0, started: true, ended: false, playing: true };
      return { ...state, started: true, playing: !state.playing };
  }
}

interface Props {
  title: string;
  scenes: Scene[];
  captions: string[];
  autoPlay?: boolean;
}

/**
 * A short animated walkthrough: a miniature copy of the app where a cursor
 * opens the right menu, clicks and types, with each step as a caption.
 * Controls work like a video player (play/pause, previous/next, replay).
 */
export default function GuideVideo({ title, scenes, captions, autoPlay = false }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [{ step, elapsed, playing, started, ended }, dispatch] = useReducer(playback, {
    step: 0,
    elapsed: 0,
    playing: autoPlay,
    started: autoPlay,
    ended: false,
  });

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [cursor, setCursor] = useState({ x: DESIGN_W / 2, y: DESIGN_H / 2 });

  const count = Math.min(scenes.length, captions.length);
  const scene = scenes[step];
  const caption = captions[step] ?? "";
  const durations = useMemo(
    () => scenes.slice(0, count).map((s, i) => durationOf(s, captions[i] ?? "")),
    [scenes, captions, count]
  );
  const duration = durations[step];
  const state = useMemo(() => stateAt(scene, elapsed), [scene, elapsed]);

  // Fit the fixed-size stage to the available width
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // Zero inside a closed guide: the stage is then not drawn at all
    const fit = () => setScale(el.clientWidth / DESIGN_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clock; moves on to the next step when one is over
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dt: now - last, durations });
      last = now;
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, durations]);

  // Move the cursor to the element it is heading for
  const target = state.cursorIndex >= 0 ? scene.actions[state.cursorIndex].target : null;
  useLayoutEffect(() => {
    if (!target || !stageRef.current) return;
    const el = stageRef.current.querySelector<HTMLElement>(`[data-target="${CSS.escape(target)}"]`);
    if (!el) return;
    const stage = stageRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const s = stage.width / DESIGN_W || 1;
    setCursor({
      x: (r.left - stage.left + r.width / 2) / s,
      y: (r.top - stage.top + r.height / 2) / s,
    });
  }, [target, step, scale, state.flags.size]);

  const goTo = (n: number, play?: boolean) => dispatch({ type: "goTo", step: n, count, play });
  const togglePlay = () => dispatch({ type: "toggle" });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight") {
      goTo(step + (document.dir === "rtl" ? -1 : 1));
    } else if (e.key === "ArrowLeft") {
      goTo(step + (document.dir === "rtl" ? 1 : -1));
    }
  };

  const progressOf = (i: number) => (i < step ? 1 : i > step ? 0 : Math.min(1, elapsed / duration));
  const dark = state.flags.has("dark");

  return (
    <div
      className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 dark:border-gray-800"
      role="region"
      aria-roledescription={t("Video guide")}
      aria-label={title}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* Stage */}
      <div ref={frameRef} className="relative w-full overflow-hidden" style={{ height: DESIGN_H * scale }}>
        {scale > 0 && (
        <div
          ref={stageRef}
          className={`absolute start-0 top-0 origin-top-left rtl:origin-top-right ${dark ? "dark" : ""}`}
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}
          aria-hidden
        >
          <SceneStage scene={scene} state={state} />

          {/* Cursor */}
          {started && state.cursorIndex >= 0 && (
            <div
              className="pointer-events-none absolute left-0 top-0 z-30"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                transition: reducedMotion ? "none" : `transform ${MOVE - 100}ms cubic-bezier(.45,.05,.3,1)`,
              }}
            >
              {state.rippleIndex >= 0 && (
                <span
                  key={`${step}-${state.rippleIndex}`}
                  className="absolute -left-4 -top-4 h-8 w-8 animate-ping rounded-full bg-brand-500/50"
                />
              )}
              <svg width="22" height="26" viewBox="0 0 22 26" className="-translate-x-[3px] -translate-y-[2px] drop-shadow">
                <path d="M3 2l15 11-6.5 1.2 3.8 8-3 1.4-3.8-8.1L3 20z" fill="#fff" stroke="#111827" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
        )}

        {/* Poster / end screen */}
        {(!started || ended) && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-gray-900/55 text-white backdrop-blur-[1px] transition hover:bg-gray-900/45"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 shadow-lg ring-8 ring-white/15">
              {ended ? <ArrowPathIcon className="h-8 w-8" /> : <PlayIcon className="h-8 w-8 translate-x-0.5 rtl:-translate-x-0.5 rtl:-scale-x-100" />}
            </span>
            <span className="text-sm font-medium">
              {ended ? t("Watch again") : t("Play the guide ({n} steps)", { n: count })}
            </span>
          </button>
        )}
      </div>

      {/* Caption */}
      <div className="bg-white px-4 pb-3 pt-3 dark:bg-gray-900" aria-live="polite">
        <div className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
            {step + 1}
          </span>
          <p className="min-h-[2.5rem] pt-1 text-sm text-gray-700 dark:text-gray-300">{caption}</p>
        </div>

        {/* Progress, one segment per step */}
        <div className="mt-3 flex gap-1" role="group" aria-label={t("Steps")}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className="group h-4 flex-1 py-1.5"
              aria-label={t("Step {n}", { n: i + 1 })}
              aria-current={i === step ? "step" : undefined}
            >
              <span className="block h-1 overflow-hidden rounded-full bg-gray-200 group-hover:bg-gray-300 dark:bg-gray-700">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${progressOf(i) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-1 flex items-center gap-1">
          <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/5" aria-label={t("Previous step")}>
            <ChevronLeftIcon className="h-5 w-5 rtl:rotate-180" />
          </button>
          <button type="button" onClick={togglePlay} className="rounded-lg p-2 text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-white/5" aria-label={playing ? t("Pause") : t("Play")}>
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 rtl:-scale-x-100" />}
          </button>
          <button type="button" onClick={() => goTo(step + 1)} disabled={step >= count - 1} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/5" aria-label={t("Next step")}>
            <ChevronRightIcon className="h-5 w-5 rtl:rotate-180" />
          </button>
          <button type="button" onClick={() => goTo(0, true)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5" aria-label={t("Replay")}>
            <ArrowPathIcon className="h-5 w-5" />
          </button>
          <span className="ms-auto text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {t("Step {n} of {total}", { n: step + 1, total: count })}
          </span>
        </div>
      </div>
    </div>
  );
}
