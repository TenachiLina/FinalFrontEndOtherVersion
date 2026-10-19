import { t } from "@/lib/i18n";
// ─────────────────────────────────────────────────────────────────────────
// App-wide feedback: toast messages and confirm dialogs.
//
//   toast.success("Planning saved");
//   toast.error(friendlyError(err, "Couldn't save the planning"));
//   if (await confirmDialog({ title: "Delete 3 records?", danger: true })) …
//
// Callable from anywhere (components, hooks, plain functions). They are drawn
// by <FeedbackHost/>, mounted once in the root layout.
// ─────────────────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red button, for deletes and other changes that can't be undone. */
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

type Listener = () => void;

let nextId = 1;
let toasts: ToastItem[] = [];
let confirmQueue: ConfirmRequest[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4500,
  warning: 6000,
  error: 7000,
};

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getToasts = () => toasts;
export const getConfirm = () => confirmQueue[0] ?? null;

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function show(kind: ToastKind, rawMessage: string, rawTitle?: string) {
  // Plain English messages are translated here, so callers can pass literals
  const message = t(rawMessage);
  const title = rawTitle ? t(rawTitle) : undefined;
  // Don't stack the same message twice (e.g. several requests failing at once)
  if (toasts.some((t) => t.kind === kind && t.message === message)) return;
  const id = nextId++;
  toasts = [...toasts.slice(-3), { id, kind, message, title }];
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismissToast(id), DURATION[kind]);
  }
}

export const toast = {
  success: (message: string, title?: string) => show("success", message, title),
  error: (message: string, title?: string) => show("error", message, title),
  info: (message: string, title?: string) => show("info", message, title),
  warning: (message: string, title?: string) => show("warning", message, title),
};

/** Asks the user to confirm. Resolves true for confirm, false for cancel. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = nextId++;
    confirmQueue = [...confirmQueue, { ...options, id, resolve }];
    emit();
  });
}

export function answerConfirm(id: number, ok: boolean) {
  const req = confirmQueue.find((c) => c.id === id);
  confirmQueue = confirmQueue.filter((c) => c.id !== id);
  emit();
  req?.resolve(ok);
}
