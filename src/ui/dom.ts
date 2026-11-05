export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const YEAR_MIN = 1979;
const YEAR_MAX = 2040;

/** The display face melts on its YEAR axis: the more cooked, the further gone. */
export function meltStyle(cooked: number) {
  const year = Math.round(YEAR_MIN + (Math.max(0, Math.min(100, cooked)) / 100) * (YEAR_MAX - YEAR_MIN));
  return `font-variation-settings:'YEAR' ${year}`;
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferences are optional */
  }
}
