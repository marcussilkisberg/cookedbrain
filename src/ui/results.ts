import type { CookedTest, InputClass, TestResult } from '../core/types';
import { median, place, tierFor, TIERS, type Placement } from '../core/stats';
import type { TestRow } from '../core/store';
import { esc, meltStyle } from './dom';

export interface Outcome {
  test: CookedTest;
  result: TestResult;
  input: InputClass;
  placement: Placement;
  before: TestRow | null;
  row: TestRow;
  isBest: boolean;
  /** Rolling median of this player's other rounds, compared the same way. */
  usual: Placement;
  orderNo: number;
  when: Date;
}

const baseUnit = (t: CookedTest) => (t.unit.startsWith('ms') ? 'ms' : t.unit);

/** What one point of a score is called, singular and plural. */
const NOUNS: Record<string, [string, string]> = {
  echo: ['step', 'steps'],
  digits: ['digit', 'digits'],
  chimp: ['number', 'numbers'],
  flashgrid: ['level', 'levels'],
  offcolour: ['level', 'levels'],
  liar: ['answer', 'answers'],
  sums: ['answer', 'answers'],
  spin: ['answer', 'answers'],
  pattern: ['puzzle', 'puzzles'],
  oddone: ['answer', 'answers'],
  dont: ['point', 'points'],
};

function noun(t: CookedTest, n: number) {
  const pair = NOUNS[t.id];
  if (!pair) return baseUnit(t);
  return n === 1 ? pair[0] : pair[1];
}

export function fmt(t: CookedTest, v: number) {
  const r = Math.round(v);
  return t.unit === 'level' ? `Level ${t.format(r)}` : `${t.format(r)} ${noun(t, r)}`;
}

/** The words for being ahead of or behind a score, in this test's terms. */
function words(t: CookedTest): [string, string] {
  if (t.id === 'deadstop') return ['closer', 'further off'];
  if (t.lowerIsBetter) return ['faster', 'slower'];
  return ['ahead', 'behind'];
}

function gap(t: CookedTest, a: number, b: number) {
  const d = Math.round(a) - Math.round(b);
  if (d === 0) return { n: 0, ahead: true, text: 'Dead level' };
  const ahead = t.lowerIsBetter ? d < 0 : d > 0;
  const [good, bad] = words(t);
  const size = Math.abs(d);
  return { n: size, ahead, text: `${size} ${noun(t, size)} ${ahead ? good : bad}` };
}

function chart(o: Outcome): string {
  const { placement: p, test: t, row } = o;
  // Drawn at its real width, so labels stay readable on a phone.
  const W = innerWidth < 820 ? Math.max(280, innerWidth - 64) : 640;
  const top = 58;
  const base = 172;
  const peak = Math.max(...p.bins.map((b) => b.share), 1e-6);
  let cum = 0;
  const bars = p.bins
    .map((b) => {
      const tier = tierFor((cum + b.share / 2) * 100);
      cum += b.share;
      const h = Math.max(1, (b.share / peak) * (base - top));
      const x = b.from * W;
      const w = (b.to - b.from) * W - 2;
      return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--t-${tier.id})"/><rect x="${x.toFixed(1)}" y="${base + 4}" width="${(w + 2).toFixed(1)}" height="5" fill="var(--t-${tier.id})"/>`;
    })
    .join('');

  const pin = (pos: number, label: string, y: number, cls: string) => {
    const x = pos * W;
    const anchor = x < 56 ? 'start' : x > W - 56 ? 'end' : 'middle';
    return `<g class="pin ${cls}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y + 5}" y2="${base}"/><text x="${x.toFixed(1)}" y="${y}" text-anchor="${anchor}">${esc(label)}</text></g>`;
  };

  const you = p.position(o.result.score);
  const pins = [
    pin(p.position(p.medianScore), `Typical ${fmt(t, p.medianScore)}`, 44, 'typ'),
    o.before && !o.isBest ? pin(p.position(row.best), `Your best ${fmt(t, row.best)}`, 28, 'best') : '',
    pin(you, `You ${fmt(t, o.result.score)}`, 12, 'you'),
  ].join('');

  return `<svg class="dist" viewBox="0 0 ${W} 186" role="img" aria-label="Where your score sits among other players: ${esc(pct(o.placement.cooked))} cooked">${bars}${pins}</svg>
  <div class="dist-ends"><span>Raw · ${esc(fmt(t, p.bestEnd))}</span><span>${esc(fmt(t, p.worstEnd))} · Burnt</span></div>`;
}

function basisLine(p: Placement) {
  if (p.basis === 'players') return `Compared with ${p.players.toLocaleString('en-GB')} ${p.who}, one row each.`;
  if (p.basis === 'early') return `Early estimate from ${p.players} ${p.who}.`;
  const seen = p.players ? ` ${p.players} so far.` : '';
  return `Reference curve, modelled rather than measured. Real placement starts at 30 ${p.who}.${seen}`;
}

function statRows(o: Outcome) {
  const { test: t, placement: p, row, result } = o;
  const rows: { k: string; v: string; n: string; good?: boolean }[] = [];
  if (p.rank != null) rows.push({ k: 'Your place', v: `#${p.rank}`, n: `of ${p.players + 1} ${p.who}` });

  const typ = gap(t, result.score, p.medianScore);
  rows.push({ k: 'Typical player', v: fmt(t, p.medianScore), n: typ.text, good: typ.ahead });

  const top = gap(t, result.score, p.top10);
  rows.push({ k: 'Top 10% starts at', v: fmt(t, p.top10), n: top.ahead ? 'You are in it' : `${top.n} ${noun(t, top.n)} to go`, good: top.ahead });

  if (p.nextTier) {
    const nt = gap(t, result.score, p.nextTier.score);
    rows.push({ k: `Next tier: ${p.nextTier.tier.name}`, v: fmt(t, p.nextTier.score), n: nt.ahead ? 'You are there' : `${nt.n} ${noun(t, nt.n)} to go` });
  } else {
    rows.push({ k: 'Next tier', v: 'None', n: 'This is the top' });
  }

  if (o.before) {
    const b = gap(t, result.score, o.before.best);
    rows.push({ k: 'Your best', v: fmt(t, row.best), n: o.isBest ? `New best, ${b.text}` : b.text, good: o.isBest });
    if (row.recent.length >= 3) {
      rows.push({ k: 'Your usual', v: fmt(t, median(row.recent)), n: `${pct(o.usual.cooked)} cooked` });
    }
  }
  rows.push({ k: 'Rounds played', v: String(row.rounds), n: `on ${o.input === 'touch' ? 'touchscreen' : o.input}` });
  return rows;
}

/** Whole percentages, without claiming a flat 0 or 100. */
export function pct(v: number) {
  if (v < 1) return '<1%';
  if (v >= 99.5) return '>99%';
  return `${v.toFixed(0)}%`;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function ticketLines(o: Outcome) {
  const d = o.when;
  const month = d.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
  return {
    head: ['COOKEDBRAIN', `ORDER ${pad(o.orderNo, 4)}`],
    date: [`${pad(d.getDate())} ${month} ${d.getFullYear()}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`],
    test: [o.test.name.toUpperCase(), `${o.test.format(o.result.score)} ${baseUnit(o.test).toUpperCase()}`],
    cooked: [`${pct(o.placement.cooked)} COOKED`, o.placement.tier.name.toUpperCase()],
    beat: `BEAT ${pct(o.placement.beaten)} OF ${o.placement.who.toUpperCase()}`,
  };
}

export function shareText(o: Outcome) {
  const l = ticketLines(o);
  return `${o.test.name}: ${l.test[1]!.toLowerCase()}. ${pct(o.placement.cooked)} cooked, ${o.placement.tier.name}.\nHow cooked is your brain? cookedbrain.com`;
}

function headline(o: Outcome) {
  const { before, isBest, test: t, result, placement: p } = o;
  if (!before) return 'First round logged. Now beat it.';
  if (isBest) return before.rounds >= 10 ? 'New best after all those rounds. Order up.' : 'New best. Order up.';
  const g = gap(t, result.score, before.best);
  const close = t.lowerIsBetter ? g.n <= Math.max(3, before.best * 0.04) : g.n <= 1;
  if (close) return `${g.n === 0 ? 'Level with your best' : g.text.replace(/ (slower|behind|further off)$/, ' off your best')}. Again.`;
  return p.tier.line;
}

export function resultsHtml(o: Outcome, claim: string) {
  const { test: t, placement: p, result } = o;
  const l = ticketLines(o);
  const line = (a: string, b: string) => `<div class="tk-l"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const estimated = p.basis === 'reference' ? 'an estimated ' : '';
  return `
  <section class="res" style="--tier:var(--t-${p.tier.id})" aria-live="polite">
    <div class="res-main">
      <p class="eyebrow">${esc(t.name)} · ${esc(t.searchTerm)}</p>
      <h1 class="res-num" style="${meltStyle(p.cooked)}">${esc(t.format(result.score))}<small>${esc(t.unit === 'level' ? 'level' : noun(t, result.score))}</small></h1>
      <p class="res-cooked"><b>${esc(pct(p.cooked))} cooked</b><span class="tier-chip">${esc(p.tier.name)}</span></p>
      <p class="res-beat">You beat ${estimated}${esc(pct(p.beaten))} of ${esc(p.who)}.</p>
      <p class="res-line">${esc(headline(o))}</p>
      <div class="res-actions">
        <button class="btn primary" id="again">Again<kbd>Space</kbd></button>
        <button class="btn" id="next">Next test<kbd>N</kbd></button>
      </div>
    </div>
    <div class="res-side">
      <div class="panel">
        <h2>How you place</h2>
        ${chart(o)}
        <p class="basis ${p.basis}">${esc(basisLine(p))}</p>
      </div>
      <div class="panel">
        <table class="stat"><tbody>${statRows(o)
          .map((r) => `<tr><th scope="row">${esc(r.k)}</th><td class="v">${esc(r.v)}</td><td class="n${r.good ? ' good' : ''}">${esc(r.n)}</td></tr>`)
          .join('')}</tbody></table>
        <dl class="detail">${result.detail.map((d) => `<div><dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd></div>`).join('')}</dl>
      </div>
      ${claim}
    </div>
      <div class="ticket" id="ticket">
        ${line(l.head[0]!, l.head[1]!)}${line(l.date[0]!, l.date[1]!)}
        <div class="tk-rule"></div>
        ${line(l.test[0]!, l.test[1]!)}${line(l.cooked[0]!, l.cooked[1]!)}
        <div class="tk-l"><span>${esc(l.beat)}</span></div>
        <div class="tk-rule"></div>
        <button class="tk-copy" id="copy">Copy result</button>
      </div>
  </section>`;
}

/** Placement for a player's rolling median, for the "your usual" row. */
export function usualPlacement(t: CookedTest, input: InputClass, row: TestRow, others: number[]) {
  return place(t, input, median(row.recent), others);
}

export { TIERS };
