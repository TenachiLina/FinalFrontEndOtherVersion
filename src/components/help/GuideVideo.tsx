"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { t } from "@/lib/i18n";
import { DEMO_FRAME, DEMO_FRAME_SIGNED_OUT } from "@/lib/demo";
import { boxOf, findTarget, frameSettled, press, reveal, setValue } from "./demoFrame";
import { DESIGN_H, DESIGN_W, Scene } from "./scenes";

// ─── Timeline ────────────────────────────────────────────────────────
// A step is a real page of the app (in demo mode) and a few actions on it.
// The clock only runs while the page in the frame has finished loading, so
// a slow page never makes the pointer act on something that isn't there.

const ENTER = 700; // the page has just appeared
const MOVE = 900; // the pointer glides to its target
const CLICK = 350; // click ripple
const TYPE_CHAR = 70; // per typed character
const SETTLE = 500;
const MIN_HOLD = 1800; // reading time after the last action
const READY_TIMEOUT = 12_000; // a page that never settles is shown as it is

interface ActionTiming {
  moveAt: number;
  clickAt: number;
  end: number;
}

export function timingsOf(scene: Scene): ActionTiming[] {
  let at = ENTER;
  return scene.actions.map((a) => {
    const moveAt = at;
    const clickAt = moveAt + MOVE;
    const end = clickAt + CLICK + (a.type ? a.type.length * TYPE_CHAR : 0) + SETTLE;
    at = end;
    return { moveAt, clickAt, end };
  });
}

export function durationOf(scene: Scene, caption: string) {
  const timings = timingsOf(scene);
  const last = timings.length ? timings[timings.length - 1].end : ENTER;
  return last + Math.max(MIN_HOLD, caption.length * 32);
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

// ─── Player ──────────────────────────────────────────────────────────

interface Playback {
  step: number;
  elapsed: number;
  playing: boolean;
  started: boolean;
  ended: boolean;
  /** Changes every time a step is (re)entered: the frame then reloads its page */
  run: number;
}

type PlaybackAction =
  | { type: "tick"; dt: number; durations: number[] }
  | { type: "goTo"; step: number; count: number; play?: boolean }
  | { type: "toggle" };

export function playback(state: Playback, action: PlaybackAction): Playback {
  switch (action.type) {
    case "tick": {
      if (!state.playing) return state;
      const elapsed = state.elapsed + action.dt;
      if (elapsed < action.durations[state.step]) return { ...state, elapsed };
      if (state.step < action.durations.length - 1) {
        return { ...state, step: state.step + 1, elapsed: 0, run: state.run + 1 };
      }
      return { ...state, elapsed: action.durations[state.step], playing: false, ended: true };
    }
    case "goTo":
      return {
        step: Math.max(0, Math.min(action.count - 1, action.step)),
        elapsed: 0,
        started: true,
        ended: false,
        playing: action.play ?? state.playing,
        run: state.run + 1,
      };
    case "toggle":
      if (state.ended) return { step: 0, elapsed: 0, started: true, ended: false, playing: true, run: state.run + 1 };
      return { ...state, started: true, playing: !state.playing };
  }
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opens a page of the app in the guide's frame. */
export function openPage(frame: HTMLIFrameElement, path: string) {
  try {
    frame.contentWindow?.location.replace(path);
  } catch {
    frame.src = path;
  }
}

interface Props {
  title: string;
  scenes: Scene[];
  captions: string[];
  autoPlay?: boolean;
  /** How a step's page is opened in the frame (tests give their own) */
  open?: (frame: HTMLIFrameElement, path: string) => void;
  /** Whether the page in the frame has finished loading (tests give their own) */
  isReady?: (doc: Document) => boolean;
}

/**
 * A short walkthrough played on the real app: the pages load in a frame, in
 * demo mode (a sample company, nothing saved), and a pointer opens the right
 * page, clicks and types, with each step as a caption. Controls work like a
 * video player (play/pause, previous/next, replay).
 */
export default function GuideVideo({ title, scenes, captions, autoPlay = false, open = openPage, isReady }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [{ step, elapsed, playing, started, ended, run }, dispatch] = useReducer(playback, {
    step: 0,
    elapsed: 0,
    playing: autoPlay,
    started: autoPlay,
    ended: false,
    run: 0,
  });

  const holderRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState({ x: DESIGN_W / 2, y: DESIGN_H / 2 });
  const [box, setBox] = useState<Box | null>(null);
  const [ripple, setRipple] = useState(-1);
  // How far this run of the step has got: last action pointed at, last one performed
  const pointed = useRef(-1);
  const performed = useRef(-1);

  const count = Math.min(scenes.length, captions.length);
  const scene = scenes[step];
  const caption = captions[step] ?? "";
  const durations = useMemo(
    () => scenes.slice(0, count).map((s, i) => durationOf(s, captions[i] ?? "")),
    [scenes, captions, count]
  );
  const duration = durations[step];
  const timings = useMemo(() => timingsOf(scene), [scene]);
  const frameName = scene.signedOut ? DEMO_FRAME_SIGNED_OUT : DEMO_FRAME;

  // Fit the fixed-size stage to the available width
  useLayoutEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / DESIGN_W);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Entering a step: the frame opens the step's page afresh
  useEffect(() => {
    if (!started) return;
    pointed.current = -1;
    performed.current = -1;
    setReady(false);
    setBox(null);
    setRipple(-1);
    const frame = frameRef.current;
    if (!frame) return;
    // The page being left is marked, so it is never taken for the new one
    try {
      frame.contentDocument?.body?.setAttribute("data-leaving", "");
    } catch {
      // not reachable: nothing to mark
    }
    open(frame, scene.path);
    // Wait until the new page has finished loading (twice in a row, so a page
    // that is between two loading states is not taken for a finished one)
    const since = Date.now();
    let settled = 0;
    const id = window.setInterval(() => {
      let doc: Document | null = null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      const loaded = (d: Document) => (isReady ? isReady(d) : frameSettled(d, t("Loading")));
      const there = !!doc && !doc.body?.hasAttribute("data-leaving") && loaded(doc);
      settled = there ? settled + 1 : 0;
      if (settled >= 2 || Date.now() - since > READY_TIMEOUT) {
        window.clearInterval(id);
        setReady(true);
      }
    }, 200);
    return () => window.clearInterval(id);
    // `run` changes on every (re)entry, also to the same step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, run, frameName]);

  // Clock; moves on to the next step when one is over. It waits for the page.
  useEffect(() => {
    if (!playing || !ready) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      dispatch({ type: "tick", dt: now - last, durations });
      last = now;
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, ready, durations]);

  // Acts on the page as the clock passes each action: point, then click or type
  const act = useCallback(() => {
    let doc: Document | null = null;
    try {
      doc = frameRef.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) return;
    scene.actions.forEach((action, i) => {
      const tm = timings[i];
      if (elapsed < tm.moveAt) return;
      const el = findTarget(doc, action.target, t);
      if (!el) return; // not on the page (yet): looked for again at the next tick
      if (i > pointed.current) {
        pointed.current = i;
        reveal(el);
      }
      if (i === pointed.current) {
        const b = boxOf(el);
        setCursor({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
        setBox(b);
      }
      if (elapsed < tm.clickAt) return;
      if (i > performed.current) {
        performed.current = i;
        setRipple(i);
        if (action.type !== undefined) el.focus();
        else if (action.click !== false) press(el);
      }
      if (action.type !== undefined) {
        const chars = Math.floor((elapsed - tm.clickAt - CLICK) / TYPE_CHAR);
        const text = action.type.slice(0, Math.max(0, Math.min(action.type.length, chars)));
        if ((el as HTMLInputElement).value !== text && i === performed.current) setValue(el, text);
      }
    });
  }, [scene, timings, elapsed]);

  useEffect(() => {
    if (started && ready) act();
  }, [started, ready, act]);

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

  return (
    <div
      className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 dark:border-gray-800"
      role="region"
      aria-roledescription={t("Video guide")}
      aria-label={title}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {/* Stage: the real app, at desktop size, scaled to fit */}
      <div ref={holderRef} className="relative w-full overflow-hidden bg-gray-100 dark:bg-gray-900" style={{ height: DESIGN_H * scale }}>
        {started && scale > 0 && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}
            aria-hidden
          >
            <iframe
              key={frameName}
              ref={frameRef}
              name={frameName}
              title={title}
              tabIndex={-1}
              data-testid="guide-frame"
              className="pointer-events-none h-full w-full border-0 bg-white"
              style={{ width: DESIGN_W, height: DESIGN_H }}
            />

            {/* What the pointer is on */}
            {box && (
              <div
                data-testid="guide-highlight"
                className="pointer-events-none absolute left-0 top-0 z-20 rounded-lg ring-4 ring-brand-500/70"
                style={{
                  width: box.width + 12,
                  height: box.height + 12,
                  transform: `translate(${box.x - 6}px, ${box.y - 6}px)`,
                  transition: reducedMotion ? "none" : "transform 300ms ease, width 300ms ease, height 300ms ease",
                }}
              />
            )}

            {/* Pointer */}
            {pointed.current >= 0 && (
              <div
                data-testid="guide-pointer"
                className="pointer-events-none absolute left-0 top-0 z-30"
                style={{
                  transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                  transition: reducedMotion ? "none" : `transform ${MOVE - 100}ms cubic-bezier(.45,.05,.3,1)`,
                }}
              >
                {ripple >= 0 && (
                  <span key={`${run}-${ripple}`} className="absolute -left-5 -top-5 h-10 w-10 animate-ping rounded-full bg-brand-500/50" />
                )}
                <svg width="34" height="40" viewBox="0 0 22 26" className="-translate-x-[4px] -translate-y-[3px] drop-shadow">
                  <path d="M3 2l15 11-6.5 1.2 3.8 8-3 1.4-3.8-8.1L3 20z" fill="#fff" stroke="#111827" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* The page is loading */}
        {started && !ready && !ended && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 text-sm text-gray-600 dark:bg-gray-900/60 dark:text-gray-300" role="status">
            {t("Loading…")}
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
            {!ended && <span className="px-6 text-center text-xs text-white/80">{t("Played on the real app with a sample company. Nothing is saved.")}</span>}
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
