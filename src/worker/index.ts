/**
 * The CookedBrain API. Scores are computed here from raw trials with the same
 * pure `score()` the browser uses, so a browser can report a round but never a
 * score. Seeds are signed and single use. Static files are served by Cloudflare
 * in front of this; only /api/* and /c/* reach the Worker.
 */
import { TESTS } from '../tests';
import { median } from '../core/stats';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SEED_SECRET: string;
  RESEND_API_KEY?: string;
  SITE: string;
}

const INPUTS = new Set(['mouse', 'touch', 'keyboard']);
const NAME_RULE = /^[A-Za-z0-9_-]{3,16}$/;
const SEED_TTL_MS = 15 * 60_000;
const SESSION_COOKIE = 'cb_s';
const POP_CAP = 1000;

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const bad = (message: string, status = 400) => json({ error: message }, status);

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomId = () => b64(crypto.getRandomValues(new Uint8Array(18)).buffer as ArrayBuffer);

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}

/** A seed is `<random>.<expiry>.<sig>`; the sig covers the test and the player. */
async function makeSeed(env: Env, test: string, player: string) {
  const body = `${randomId().slice(0, 10)}.${Date.now() + SEED_TTL_MS}`;
  const sig = (await hmac(env.SEED_SECRET, `${body}|${test}|${player}`)).slice(0, 16);
  return `${body}.${sig}`;
}
async function checkSeed(env: Env, seed: string, test: string, player: string) {
  const parts = seed.split('.');
  if (parts.length !== 3) return 'malformed seed';
  const [rand, exp, sig] = parts as [string, string, string];
  if (Number(exp) < Date.now()) return 'seed expired';
  const want = (await hmac(env.SEED_SECRET, `${rand}.${exp}|${test}|${player}`)).slice(0, 16);
  return sig === want ? null : 'bad seed signature';
}
/** The seed without its player-bound signature: what a challenge link carries. */
const publicSeed = (seed: string) => seed.split('.').slice(0, 2).join('.');
async function challengeSeed(env: Env, pub: string, test: string, player: string) {
  const sig = (await hmac(env.SEED_SECRET, `${pub}|${test}|${player}`)).slice(0, 16);
  return `${pub}.${sig}`;
}

function cookie(req: Request, name: string) {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1]! : null;
}
const setCookie = (name: string, value: string, maxAge: number) =>
  `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

interface Player {
  id: string;
  name: string | null;
  email: string | null;
}

/** Every visitor gets a guest player on first contact. */
async function getOrCreatePlayer(req: Request, env: Env): Promise<{ player: Player; setCookieHeader: string | null }> {
  const token = cookie(req, SESSION_COOKIE);
  if (token) {
    const row = await env.DB.prepare('SELECT p.id, p.name, p.email FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token = ?')
      .bind(token)
      .first<Player>();
    if (row) {
      await env.DB.prepare('UPDATE sessions SET seen = ? WHERE token = ?').bind(Date.now(), token).run();
      return { player: row, setCookieHeader: null };
    }
  }
  const id = 'p_' + randomId();
  const t = 'p_' + randomId() + randomId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, created, updated) VALUES (?, ?, ?)').bind(id, now, now),
    env.DB.prepare('INSERT INTO sessions (token, player_id, created, seen) VALUES (?, ?, ?, ?)').bind(t, id, now, now),
  ]);
  return { player: { id, name: null, email: null }, setCookieHeader: setCookie(SESSION_COOKIE, t, 60 * 60 * 24 * 400) };
}

interface RowRec {
  test: string;
  version: number;
  input: string;
  best: number;
  recent: string;
  rounds: number;
}

async function playerDoc(env: Env, p: Player) {
  const rows = await env.DB.prepare('SELECT test, version, input, best, recent, rounds FROM rows WHERE player_id = ?').bind(p.id).all<RowRec>();
  const tests: Record<string, { best: number; recent: number[]; rounds: number }> = {};
  for (const r of rows.results) tests[`${r.test}:${r.input}`] = { best: r.best, recent: JSON.parse(r.recent), rounds: r.rounds };
  return { id: p.id, name: p.name, email: p.email ? p.email.replace(/^(.).*(@.*)$/, '$1***$2') : null, tests };
}

/** Other players' rolling medians on a test and input class, one per player. */
async function population(env: Env, test: string, version: number, input: string, except: string) {
  const r = await env.DB.prepare('SELECT median FROM rows WHERE test = ? AND version = ? AND input = ? AND player_id != ? ORDER BY updated DESC LIMIT ?')
    .bind(test, version, input, except, POP_CAP)
    .all<{ median: number }>();
  return r.results.map((x) => x.median);
}

async function sendMagicLink(env: Env, email: string, url: string) {
  if (!env.RESEND_API_KEY) return { ok: false, reason: 'email not configured' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'CookedBrain <chef@cookedbrain.com>',
      to: [email],
      subject: 'Your CookedBrain sign-in link',
      text: `Press this to sign in. It works once and expires in 20 minutes.\n\n${url}\n\nIf you did not ask for it, ignore this and nothing happens.\n\nThe Chef`,
    }),
  });
  return { ok: r.ok, reason: r.ok ? '' : `resend ${r.status}` };
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');
  const { player, setCookieHeader } = await getOrCreatePlayer(req, env);
  const withCookie = (res: Response) => {
    if (setCookieHeader) res.headers.append('set-cookie', setCookieHeader);
    return res;
  };

  if (req.method === 'GET' && path === '/me') return withCookie(json(await playerDoc(env, player)));

  if (req.method === 'POST' && path === '/seed') {
    const { test } = (await req.json()) as { test?: string };
    const t = TESTS.find((x) => x.id === test);
    if (!t) return withCookie(bad('unknown test'));
    return withCookie(json({ seed: await makeSeed(env, t.id, player.id) }));
  }

  if (req.method === 'POST' && path === '/round') {
    const body = (await req.json()) as { test?: string; version?: number; input?: string; seed?: string; trials?: unknown[]; hidden?: boolean };
    const t = TESTS.find((x) => x.id === body.test);
    if (!t) return withCookie(bad('unknown test'));
    if (t.version !== body.version) return withCookie(bad('test version changed, reload', 409));
    if (!body.input || !INPUTS.has(body.input)) return withCookie(bad('bad input class'));
    if (!body.seed || !Array.isArray(body.trials) || body.trials.length > 500) return withCookie(bad('bad round'));
    const seedErr = await checkSeed(env, body.seed, t.id, player.id);
    if (seedErr) return withCookie(bad(seedErr, 403));
    if (body.hidden) return withCookie(bad('tab was hidden', 422));

    let result;
    try {
      result = t.score(body.trials as never[]);
    } catch {
      return withCookie(bad('trials could not be scored'));
    }
    if (!result.valid || !Number.isFinite(result.score)) return withCookie(bad('round not valid', 422));

    const now = Date.now();
    const key = { test: t.id, version: t.version, input: body.input };
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO rounds (player_id, test, version, input, seed, score, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(player.id, key.test, key.version, key.input, body.seed, result.score, now)
      .run();
    if (!ins.meta.changes) return withCookie(bad('seed already used', 409));

    const prev = await env.DB.prepare('SELECT best, recent, rounds FROM rows WHERE player_id = ? AND test = ? AND version = ? AND input = ?')
      .bind(player.id, key.test, key.version, key.input)
      .first<{ best: number; recent: string; rounds: number }>();
    const recent = [...(prev ? (JSON.parse(prev.recent) as number[]) : []), result.score].slice(-10);
    const isBest = !prev || (t.lowerIsBetter ? result.score < prev.best : result.score > prev.best);
    const best = isBest ? result.score : prev!.best;
    const row = { best, recent, rounds: (prev?.rounds ?? 0) + 1 };
    await env.DB.prepare(
      `INSERT INTO rows (player_id, test, version, input, best, median, recent, rounds, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, test, version, input) DO UPDATE SET best = excluded.best, median = excluded.median, recent = excluded.recent, rounds = excluded.rounds, updated = excluded.updated`,
    )
      .bind(player.id, key.test, key.version, key.input, best, median(recent), JSON.stringify(recent), row.rounds, now)
      .run();

    const others = await population(env, key.test, key.version, key.input, player.id);
    return withCookie(
      json({
        result,
        row,
        before: prev ? { best: prev.best, recent: JSON.parse(prev.recent), rounds: prev.rounds } : null,
        isBest,
        others,
        challenge: publicSeed(body.seed),
      }),
    );
  }

  if (req.method === 'GET' && path === '/population') {
    const test = url.searchParams.get('test') ?? '';
    const input = url.searchParams.get('input') ?? '';
    const t = TESTS.find((x) => x.id === test);
    if (!t || !INPUTS.has(input)) return withCookie(bad('bad query'));
    return withCookie(json({ others: await population(env, t.id, t.version, input, player.id) }, 200, { 'cache-control': 'private, max-age=30' }));
  }

  if (req.method === 'GET' && path === '/board') {
    const test = url.searchParams.get('test') ?? '';
    const input = url.searchParams.get('input') ?? '';
    const t = TESTS.find((x) => x.id === test);
    if (!t || !INPUTS.has(input)) return withCookie(bad('bad query'));
    const dir = t.lowerIsBetter ? 'ASC' : 'DESC';
    const named = await env.DB.prepare(
      `SELECT p.id, p.name, r.best, r.rounds FROM rows r JOIN players p ON p.id = r.player_id
       WHERE r.test = ? AND r.version = ? AND r.input = ? AND p.name IS NOT NULL ORDER BY r.best ${dir} LIMIT 100`,
    )
      .bind(t.id, t.version, input)
      .all<{ id: string; name: string; best: number; rounds: number }>();
    const guests = await env.DB.prepare('SELECT COUNT(*) AS n FROM rows r JOIN players p ON p.id = r.player_id WHERE r.test = ? AND r.version = ? AND r.input = ? AND p.name IS NULL')
      .bind(t.id, t.version, input)
      .first<{ n: number }>();
    return withCookie(
      json({
        named: named.results.map((r) => ({ id: r.id === player.id ? 'me' : r.id, name: r.name, row: { best: r.best, rounds: r.rounds, recent: [] } })),
        guests: guests?.n ?? 0,
        others: await population(env, t.id, t.version, input, player.id),
      }),
    );
  }

  if (req.method === 'POST' && path === '/name') {
    const { name } = (await req.json()) as { name?: string };
    if (!name || !NAME_RULE.test(name)) return withCookie(bad('Use 3 to 16 letters, numbers, dashes or underscores.'));
    try {
      await env.DB.prepare('UPDATE players SET name = ?, updated = ? WHERE id = ?').bind(name, Date.now(), player.id).run();
    } catch {
      return withCookie(bad('That name is taken. Try another.', 409));
    }
    return withCookie(json({ ok: true, name }));
  }

  if (req.method === 'POST' && path === '/auth/start') {
    const { email } = (await req.json()) as { email?: string };
    const e = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return withCookie(bad('That does not look like an email address.'));
    const token = randomId() + randomId();
    await env.DB.prepare('INSERT INTO magic_links (token, email, from_player, expires) VALUES (?, ?, ?, ?)').bind(token, e, player.id, Date.now() + 20 * 60_000).run();
    const link = `${env.SITE}/api/auth/verify?t=${token}`;
    const sent = await sendMagicLink(env, e, link);
    if (!sent.ok) return withCookie(bad(`Could not send the email (${sent.reason}).`, 502));
    return withCookie(json({ ok: true }));
  }

  if (req.method === 'GET' && path === '/auth/verify') {
    const token = url.searchParams.get('t') ?? '';
    const link = await env.DB.prepare('SELECT email, from_player, expires, used FROM magic_links WHERE token = ?')
      .bind(token)
      .first<{ email: string; from_player: string; expires: number; used: number }>();
    if (!link || link.used || link.expires < Date.now()) return new Response('That link has expired. Ask for a new one.', { status: 400 });
    await env.DB.prepare('UPDATE magic_links SET used = 1 WHERE token = ?').bind(token).run();

    // The email's existing player wins; the guest's rows move over where they are better or new.
    const owner = await env.DB.prepare('SELECT id, name, email FROM players WHERE email = ?').bind(link.email).first<Player>();
    let target = owner?.id ?? link.from_player;
    if (!owner) {
      await env.DB.prepare('UPDATE players SET email = ?, updated = ? WHERE id = ?').bind(link.email, Date.now(), link.from_player).run();
    } else if (owner.id !== link.from_player) {
      await mergePlayers(env, link.from_player, owner.id);
      target = owner.id;
    }
    const t = 'p_' + randomId() + randomId();
    await env.DB.prepare('INSERT INTO sessions (token, player_id, created, seen) VALUES (?, ?, ?, ?)').bind(t, target, Date.now(), Date.now()).run();
    return new Response(null, { status: 302, headers: { location: '/#you', 'set-cookie': setCookie(SESSION_COOKIE, t, 60 * 60 * 24 * 400) } });
  }

  if (req.method === 'POST' && path === '/auth/out') {
    const token = cookie(req, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return json({ ok: true }, 200, { 'set-cookie': setCookie(SESSION_COOKIE, '', 0) });
  }

  if (req.method === 'GET' && path.startsWith('/challenge/')) {
    const pub = decodeURIComponent(path.slice('/challenge/'.length));
    const round = await env.DB.prepare(
      'SELECT r.test, r.score, r.input, p.name FROM rounds r JOIN players p ON p.id = r.player_id WHERE r.seed LIKE ? ORDER BY r.created ASC LIMIT 1',
    )
      .bind(`${pub}.%`)
      .first<{ test: string; score: number; input: string; name: string | null }>();
    if (!round) return withCookie(bad('No such challenge.', 404));
    const t = TESTS.find((x) => x.id === round.test);
    if (!t) return withCookie(bad('No such challenge.', 404));
    return withCookie(json({ test: t.id, score: round.score, input: round.input, name: round.name, seed: await challengeSeed(env, pub, t.id, player.id) }));
  }

  return withCookie(bad('not found', 404));
}

async function mergePlayers(env: Env, from: string, into: string) {
  const rows = await env.DB.prepare('SELECT test, version, input, best, recent, rounds FROM rows WHERE player_id = ?').bind(from).all<RowRec>();
  for (const r of rows.results) {
    const have = await env.DB.prepare('SELECT best, recent, rounds FROM rows WHERE player_id = ? AND test = ? AND version = ? AND input = ?')
      .bind(into, r.test, r.version, r.input)
      .first<{ best: number; recent: string; rounds: number }>();
    const t = TESTS.find((x) => x.id === r.test);
    if (!have) {
      await env.DB.prepare('UPDATE rows SET player_id = ? WHERE player_id = ? AND test = ? AND version = ? AND input = ?').bind(into, from, r.test, r.version, r.input).run();
      continue;
    }
    const recent = [...(JSON.parse(have.recent) as number[]), ...(JSON.parse(r.recent) as number[])].slice(-10);
    const best = t?.lowerIsBetter ? Math.min(have.best, r.best) : Math.max(have.best, r.best);
    await env.DB.batch([
      env.DB.prepare('UPDATE rows SET best = ?, median = ?, recent = ?, rounds = ?, updated = ? WHERE player_id = ? AND test = ? AND version = ? AND input = ?')
        .bind(best, median(recent), JSON.stringify(recent), have.rounds + r.rounds, Date.now(), into, r.test, r.version, r.input),
      env.DB.prepare('DELETE FROM rows WHERE player_id = ? AND test = ? AND version = ? AND input = ?').bind(from, r.test, r.version, r.input),
    ]);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE rounds SET player_id = ? WHERE player_id = ?').bind(into, from),
    env.DB.prepare('UPDATE sessions SET player_id = ? WHERE player_id = ?').bind(into, from),
  ]);
}

/** /c/<seed>: the page with share tags for the challenge, then the app takes over. */
async function challengePage(req: Request, env: Env, url: URL) {
  const pub = url.pathname.slice(3);
  const round = await env.DB.prepare('SELECT r.test, r.score, p.name FROM rounds r JOIN players p ON p.id = r.player_id WHERE r.seed LIKE ? ORDER BY r.created ASC LIMIT 1')
    .bind(`${pub}.%`)
    .first<{ test: string; score: number; name: string | null }>();
  const page = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), req));
  let html = await page.text();
  if (round) {
    const t = TESTS.find((x) => x.id === round.test);
    const who = round.name ?? 'Someone';
    const title = t ? `${who} scored ${t.format(round.score)} ${t.unit} on ${t.name}. Beat it.` : 'Beat this.';
    html = html
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="Same test, same seed. How cooked is your brain?">`);
  }
  return new Response(html, { status: round ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return bad(`server error: ${(e as Error).message}`, 500);
      }
    }
    if (url.pathname.startsWith('/c/')) return challengePage(req, env, url);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
