/**
 * Structural check on where the auth guards sit.
 *
 * Nine routes answer both GET and POST from one `path.match` block. Placing a
 * guard before the `if (req.method === ...)` split protects the mutating verb
 * and the read alike — which turns every list, poll, and fetch into a 401 and
 * leaves the app unable to render. That happened, and it presented as a wallet
 * that "wouldn't finish signing" rather than as a routing mistake.
 *
 * Reads stay open on purpose: the spending routes are what need a principal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, '..', 'src', 'server.js'), 'utf8').split('\n');
const matchLines = SOURCE.map((line, i) => (line.includes('path.match') ? i : -1)).filter((i) => i >= 0);

const blocks = matchLines.map((start, n) => {
  const end = matchLines[n + 1] ?? SOURCE.length;
  return { start, end, body: SOURCE.slice(start, end) };
});

/**
 * Routes that read or evaluate policy and move nothing. They are exempt from
 * the principal gate on purpose, and the exemption is listed here rather than
 * left implicit, so adding a route means making a deliberate choice.
 */
// The route is written with an escaped slash in the source regex.
const READ_ONLY = ['x402\\/validate'];

test('every requirePrincipal guard sits inside a mutating branch, never ahead of a read', () => {
  const offenders = [];
  for (const { start, body } of blocks) {
    const offset = (pred) => body.findIndex(pred);
    const guard = offset((l) => l.includes('requirePrincipal(spaceId, body);'));
    if (guard < 0) continue;
    const get = offset((l) => l.includes("req.method === 'GET'"));
    const post = offset((l) => l.includes("req.method === 'POST'"));
    if (get >= 0 && post >= 0 && guard < Math.min(get, post)) {
      offenders.push(`${start + 1}: ${SOURCE[start].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `guards placed ahead of a read: ${offenders.join('; ')}`);
});

test('every mutating route is guarded, by either requireSession or requirePrincipal', () => {
  const unguarded = [];
  for (const { start, body } of blocks) {
    const methods = new Set(
      [...body.join('\n').matchAll(/req\.method === '(\w+)'/g)].map((m) => m[1]).filter((m) => m !== 'GET'),
    );
    if (methods.size === 0) continue;
    if (READ_ONLY.some((frag) => SOURCE[start].includes(frag))) continue;
    const text = body.join('\n');
    if (!text.includes('requireSession') && !text.includes('requirePrincipal')) {
      unguarded.push(`${start + 1}: ${SOURCE[start].trim()}`);
    }
  }
  assert.deepEqual(unguarded, [], `unguarded mutating routes: ${unguarded.join('; ')}`);
});

test('the read-only exemptions are routes that genuinely change nothing', () => {
  for (const { start, body } of blocks) {
    if (!READ_ONLY.some((frag) => SOURCE[start].includes(frag))) continue;
    const text = body.join('\n');
    // An exempt route must not settle, escrow, or write. If one ever does, it
    // stops being a read and the exemption has to go.
    assert.ok(
      !/store\.(requestPayment|createJob|fundSpace|addParticipant|revokeDelegation|createDelegation|signDelegation)\s*\(/.test(text),
      `${SOURCE[start].trim()} is listed read-only but calls a mutating store method`,
    );
    assert.ok(!text.includes('app.mutate('), `${SOURCE[start].trim()} is listed read-only but mutates`);
  }
});

test('the routes that mint authority stay session-only', () => {
  // Letting an agent delegation stand in for a wallet session on any of these
  // would let an agent enrol more agents or rewrite the limits it obeys.
  const mustStaySession = ['invitations', 'budget-binding', 'limits', 'governance', 'x402/intents', 'delegations'];
  for (const { body } of blocks) {
    const route = body[0];
    if (!mustStaySession.some((frag) => route.includes(frag))) continue;
    assert.ok(body.join('\n').includes('requireSession'), `${route.trim()} must require a wallet session`);
  }
});
