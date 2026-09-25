import crypto from 'node:crypto';
import { verifyMessage } from 'viem';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function normalizeAddress(address) {
  if (!ADDRESS.test(String(address || ''))) throw new Error('A valid EVM address is required');
  return String(address).toLowerCase();
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

export function createAuthStore() {
  const challenges = new Map();
  const sessions = new Map();
  return {
    issueChallenge(address) {
      const normalized = normalizeAddress(address);
      const nonce = crypto.randomBytes(16).toString('hex');
      const expiresAt = Date.now() + CHALLENGE_TTL_MS;
      const message = [
        'Microcosm Space access',
        `Address: ${normalized}`,
        'Chain: 1952',
        `Nonce: ${nonce}`,
        'This request authenticates a wallet for Microcosm only.',
      ].join('\n');
      challenges.set(normalized, { nonce, message, expiresAt });
      return { address: normalized, nonce, message, expiresAt };
    },
    async verify(address, signature) {
      const normalized = normalizeAddress(address);
      const challenge = challenges.get(normalized);
      challenges.delete(normalized);
      if (!challenge || challenge.expiresAt < Date.now()) throw new Error('Wallet challenge expired');
      if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) throw new Error('A valid wallet signature is required');
      const valid = await verifyMessage({ address: normalized, message: challenge.message, signature });
      if (!valid) throw new Error('Wallet signature verification failed');
      const token = crypto.randomBytes(32).toString('hex');
      const session = { address: normalized, expiresAt: Date.now() + SESSION_TTL_MS };
      sessions.set(token, session);
      return { token, session: { address: session.address, expiresAt: session.expiresAt } };
    },
    getSession(cookieHeader) {
      const token = parseCookies(cookieHeader)['microcosm_session'];
      if (!token) return null;
      const session = sessions.get(token);
      if (!session || session.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
      }
      return { token, ...session };
    },
    revoke(cookieHeader) {
      const token = parseCookies(cookieHeader)['microcosm_session'];
      if (token) sessions.delete(token);
    },
  };
}

export function sessionCookie(token, secure = false) {
  return `microcosm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure = false) {
  return `microcosm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}
