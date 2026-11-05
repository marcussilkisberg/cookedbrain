import type { Press } from '../core/types';

/** The shared number pad for tests that take digits by touch, mouse or keyboard. */
export const keypadHtml = () =>
  `<div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']
    .map((k) => `<button class="key" data-k="${k}">${k === 'del' ? 'Del' : k === 'ok' ? 'OK' : k}</button>`)
    .join('')}</div>`;

/** Reads a press as a pad action: a digit, 'del', 'ok', or null if it was neither. */
export function padKey(p: Press): string | null {
  if (p.key) {
    if (/^[0-9]$/.test(p.key)) return p.key;
    if (p.key === 'Backspace') return 'del';
    if (p.key === 'Enter') return 'ok';
    return null;
  }
  const el = (p.target as HTMLElement | null)?.closest?.('[data-k]') as HTMLElement | null;
  return el?.dataset['k'] ?? null;
}
