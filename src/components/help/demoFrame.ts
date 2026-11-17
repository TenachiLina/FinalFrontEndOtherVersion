// ─────────────────────────────────────────────────────────────────────────
// Driving the real app inside the guide's frame
//
// A guide plays the real pages (in demo mode, see lib/demo.ts). These
// helpers find what a step points at, the way a person would describe it
// ("the Add Employee button", "the First Name field"), and act on it.
// ─────────────────────────────────────────────────────────────────────────

/** What a step points at. Texts are the English ones; they are translated before looking. */
export interface Target {
  /** The visible text of a button, link, tab, heading or cell */
  text?: string;
  /** The label (or placeholder) of a form field */
  label?: string;
  /** A CSS selector, when there is no text to go by */
  selector?: string;
  /** Only look at buttons or links */
  role?: "button" | "link";
  /** Which one, when several match (0 = first) */
  nth?: number;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** A field's label without its decorations: "Base Salary: *" and "Amount (DA)" are "Base Salary", "Amount". */
const labelOf = (s: string | null | undefined) =>
  norm((s ?? "").replace(/\([^)]*\)/g, "").replace(/[*:]/g, ""));

function visible(el: Element): boolean {
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !style || (style.visibility !== "hidden" && style.display !== "none");
}

const CLICKABLE = "button, a, [role=button], [role=tab], [role=menuitem], summary";
const READABLE = `${CLICKABLE}, label, th, td, h1, h2, h3, h4, h5, li, p, span, div`;
const FIELD = "input, select, textarea";

/** The field a label names: tied by `for`, wrapped by it, or right after it. */
function fieldOf(label: Element): Element | null {
  const doc = label.ownerDocument;
  const tied = label.getAttribute("for");
  if (tied) {
    const el = doc.getElementById(tied);
    if (el) return el;
  }
  const inside = label.querySelector(FIELD);
  if (inside) return inside;
  let next = label.nextElementSibling;
  for (let i = 0; next && i < 2; i++, next = next.nextElementSibling) {
    if (next.matches(FIELD)) return next;
    const nested = next.querySelector(FIELD);
    if (nested) return nested;
  }
  return null;
}

/**
 * Finds what a target describes in the frame's document; null when it is
 * not there (yet). Among elements with the same text, the innermost wins:
 * the button itself, not the bar that contains it.
 */
export function findTarget(doc: Document, target: Target, translate: (text: string) => string = (x) => x): HTMLElement | null {
  const nth = target.nth ?? 0;
  if (target.selector) {
    return ([...doc.querySelectorAll(target.selector)].filter(visible)[nth] as HTMLElement) ?? null;
  }
  if (target.label) {
    const wanted = labelOf(translate(target.label));
    const fields: Element[] = [];
    for (const label of doc.querySelectorAll("label")) {
      if (labelOf(label.textContent) !== wanted) continue;
      const field = fieldOf(label);
      if (field && visible(field)) fields.push(field);
    }
    for (const field of doc.querySelectorAll(FIELD)) {
      const named = labelOf(field.getAttribute("placeholder")) === wanted || labelOf(field.getAttribute("aria-label")) === wanted;
      if (named && visible(field) && !fields.includes(field)) fields.push(field);
    }
    return (fields[nth] as HTMLElement) ?? null;
  }
  if (target.text) {
    const wanted = norm(translate(target.text));
    const pool = target.role === "button" ? "button, [role=button]" : target.role === "link" ? "a" : READABLE;
    const matches = [...doc.querySelectorAll(pool)].filter((el) => {
      // By what it says, or by its accessible name (an icon button says nothing)
      const names = [norm(el.textContent), norm(el.getAttribute("aria-label")), norm(el.getAttribute("title"))];
      return names.includes(wanted) && visible(el);
    });
    // Keep the innermost of nested matches (a <span> inside the <button>
    // has the same text), but prefer something clickable when there is one
    const innermost = matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
    const picked = innermost.map((el) => (el.closest(CLICKABLE) as Element | null) ?? el);
    const unique = picked.filter((el, i) => picked.indexOf(el) === i);
    return (unique[nth] as HTMLElement) ?? null;
  }
  return null;
}

/** Where an element is in the frame, in the frame's own pixels. */
export function boxOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** Brings an element into view inside the frame, without moving the page that holds the frame. */
export function reveal(el: Element) {
  const view = el.ownerDocument.defaultView;
  if (!view) return;
  const r = el.getBoundingClientRect();
  if (r.top >= 80 && r.bottom <= view.innerHeight - 40) return;
  const scroller = findScroller(el) ?? el.ownerDocument.scrollingElement;
  if (!scroller) return;
  scroller.scrollTop += r.top - view.innerHeight / 2 + r.height / 2;
}

function findScroller(el: Element): Element | null {
  const view = el.ownerDocument.defaultView;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = view?.getComputedStyle(p).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Types into a field the way the app expects: React only notices a value
 * set through the element's own setter, followed by an input event.
 */
export function setValue(field: HTMLElement, value: string) {
  const view = field.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!view) return;
  const proto =
    field instanceof view.HTMLTextAreaElement
      ? view.HTMLTextAreaElement.prototype
      : field instanceof view.HTMLSelectElement
        ? view.HTMLSelectElement.prototype
        : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) return;
  setter.call(field, value);
  field.dispatchEvent(new view.Event("input", { bubbles: true }));
  field.dispatchEvent(new view.Event("change", { bubbles: true }));
}

/** Presses an element the way a click does. */
export function press(el: HTMLElement) {
  const view = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!view) return;
  // Menus and dropdowns of the app listen to mousedown as well as click
  for (const type of ["mousedown", "mouseup"]) {
    el.dispatchEvent(new view.MouseEvent(type, { bubbles: true, cancelable: true, view }));
  }
  el.click();
}

/**
 * True once the frame shows a page that has finished loading: the app is
 * there, and nothing on it still says "Loading…".
 */
export function frameSettled(doc: Document | null | undefined, loadingText = "Loading"): boolean {
  if (!doc || doc.readyState !== "complete" || !doc.body) return false;
  const text = doc.body.textContent ?? "";
  return text.trim().length > 0 && !text.includes(loadingText);
}
