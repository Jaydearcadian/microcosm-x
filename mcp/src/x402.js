import crypto from 'node:crypto';
import { evaluateSpacePayment } from '../../packages/policy-engine/src/index.js';
import { hashTypedData, verifyTypedData } from 'viem';

const MAX_TIMEOUT_SECONDS = 3600;
const UINT256_MAX = (1n << 256n) - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DOMAIN_NAME = 'Microcosm x402 Intent';
const TYPES = Object.freeze({
  X402Intent: [
    { name: 'intentId', type: 'string' },
    { name: 'spaceId', type: 'string' },
    { name: 'requester', type: 'address' },
    { name: 'resource', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'asset', type: 'address' },
    { name: 'payTo', type: 'address' },
    { name: 'network', type: 'string' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
});
let coreValidatorPromise;

function fallbackParse(value) {
  if (!value || typeof value !== 'object' || value.x402Version !== 2) {
    return { success: false, error: { issues: [{ message: 'x402Version must be 2' }] } };
  }
  if (!value.resource || typeof value.resource !== 'object' || typeof value.resource.url !== 'string' || !value.resource.url) {
    return { success: false, error: { issues: [{ message: 'resource.url is required' }] } };
  }
  if (!Array.isArray(value.accepts) || value.accepts.length === 0) {
    return { success: false, error: { issues: [{ message: 'accepts must contain at least one option' }] } };
  }
  for (const accept of value.accepts) {
    if (!accept || typeof accept !== 'object' || typeof accept.scheme !== 'string' || !accept.scheme || typeof accept.network !== 'string' || typeof accept.amount !== 'string' || typeof accept.asset !== 'string' || typeof accept.payTo !== 'string' || typeof accept.maxTimeoutSeconds !== 'number') {
      return { success: false, error: { issues: [{ message: 'invalid x402 v2 accept' }] } };
    }
  }
  return { success: true, data: value };
}

function parseWithCore(value) {
  if (!coreValidatorPromise) {
    coreValidatorPromise = import('@x402/core/schemas')
      .then((module) => module.parsePaymentRequired)
      .catch(() => null);
  }
  return coreValidatorPromise.then((parse) => (parse ? parse(value) : fallbackParse(value)));
}

function isValidAddress(value) {
  return typeof value === 'string' && ADDRESS.test(value) && !/^0x0{40}$/i.test(value);
}

function parseAtomicAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const amount = BigInt(value);
  if (amount <= 0n || amount > UINT256_MAX) return null;
  return amount;
}

function toSixDecimalString(amount) {
  const whole = amount / 1000000n;
  const fraction = (amount % 1000000n).toString().padStart(6, '0');
  return `${whole.toString()}.${fraction}`;
}

function resultFailure(reasons, extra = {}) {
  return { valid: false, protocolValid: false, policyAllowed: false, reasons, selectedAcceptIndex: null, selectedAccept: null, ...extra };
}

export async function validateX402PaymentIntent({ space, paymentRequired, selectedAcceptIndex, actorId, expectedAssetAddress }) {
  if (!space || typeof space !== 'object') return resultFailure(['Space configuration is required']);
  if (typeof expectedAssetAddress !== 'string' || !isValidAddress(expectedAssetAddress)) {
    return resultFailure(['expectedAssetAddress must be a non-zero EVM address']);
  }
  if (typeof actorId !== 'string' || !actorId.trim()) return resultFailure(['actorId is required']);
  if (!Number.isInteger(selectedAcceptIndex) || selectedAcceptIndex < 0) {
    return resultFailure(['selectedAcceptIndex is required and must be an explicit non-negative integer']);
  }

  if (!paymentRequired || typeof paymentRequired !== 'object' || paymentRequired.x402Version !== 2) {
    return resultFailure(['x402Version 2 is required']);
  }

  const parsed = await parseWithCore(paymentRequired);
  if (!parsed.success) {
    return resultFailure(parsed.error?.issues?.map((issue) => issue.message) || ['Invalid x402 PaymentRequired']);
  }
  const declaration = parsed.data;
  if (declaration.x402Version !== 2) return resultFailure(['x402Version 2 is required']);
  if (!Array.isArray(declaration.accepts) || declaration.accepts.length === 0) return resultFailure(['At least one x402 accept is required']);
  if (selectedAcceptIndex >= declaration.accepts.length) return resultFailure(['selectedAcceptIndex is outside accepts']);

  const selected = declaration.accepts[selectedAcceptIndex];
  const reasons = [];
  const expectedNetwork = `eip155:${space.chainId}`;
  if (selected.network !== expectedNetwork) reasons.push(`Network mismatch: expected ${expectedNetwork}`);
  if (String(selected.asset).toLowerCase() !== expectedAssetAddress.toLowerCase()) {
    reasons.push(`Asset mismatch: expected ${expectedAssetAddress}`);
  }
  if (!isValidAddress(selected.payTo)) reasons.push('payTo must be a non-zero EVM address');
  const atomicAmount = parseAtomicAmount(selected.amount);
  if (atomicAmount === null) reasons.push('amount must be a positive uint256 atomic amount');
  if (!Number.isInteger(selected.maxTimeoutSeconds) || selected.maxTimeoutSeconds < 1 || selected.maxTimeoutSeconds > MAX_TIMEOUT_SECONDS) {
    reasons.push(`maxTimeoutSeconds must be an integer between 1 and ${MAX_TIMEOUT_SECONDS}`);
  }

  const amountDecimal = atomicAmount === null ? null : toSixDecimalString(atomicAmount);
  if (reasons.length > 0) {
    return {
      valid: false,
      protocolValid: false,
      policyAllowed: false,
      reasons,
      selectedAcceptIndex,
      selectedAccept: { scheme: selected.scheme, network: selected.network, asset: selected.asset, payTo: selected.payTo, amount: selected.amount, amountDecimal, maxTimeoutSeconds: selected.maxTimeoutSeconds },
    };
  }

  const policy = evaluateSpacePayment(space, {
    actorId,
    recipient: selected.payTo,
    amount: amountDecimal,
    asset: space.currency || 'USDC',
  });
  return {
    valid: policy.allowed,
    protocolValid: true,
    policyAllowed: policy.allowed,
    reasons: policy.reasons,
    selectedAcceptIndex,
    selectedAccept: { scheme: selected.scheme, network: selected.network, asset: selected.asset, payTo: selected.payTo, amount: selected.amount, amountDecimal, maxTimeoutSeconds: selected.maxTimeoutSeconds },
  };
}

export function normalizeX402Expiry(expiry, maxTimeoutSeconds, nowMs = Date.now()) {
  const timeout = Number.isInteger(maxTimeoutSeconds) ? maxTimeoutSeconds : MAX_TIMEOUT_SECONDS;
  let expiryMs;
  if (expiry === undefined || expiry === null || expiry === '') {
    expiryMs = nowMs + timeout * 1000;
  } else if (typeof expiry === 'number') {
    expiryMs = expiry < 1e12 ? expiry * 1000 : expiry;
  } else if (typeof expiry === 'string' && /^\d+$/.test(expiry.trim())) {
    const value = Number(expiry.trim());
    expiryMs = value < 1e12 ? value * 1000 : value;
  } else {
    expiryMs = Date.parse(expiry);
  }
  if (!Number.isFinite(expiryMs)) throw new Error('x402 intent expiry must be an ISO date or epoch');
  if (expiryMs <= nowMs) throw new Error('x402 intent expiry must be in the future');
  if (expiryMs > nowMs + MAX_TIMEOUT_SECONDS * 1000) throw new Error(`x402 intent expiry must be within ${MAX_TIMEOUT_SECONDS} seconds`);
  return expiryMs;
}

export function x402IntentTypedData(intent) {
  return {
    domain: {
      name: DOMAIN_NAME,
      version: '1',
      chainId: intent.chainId,
    },
    types: TYPES,
    primaryType: 'X402Intent',
    message: {
      intentId: intent.intentId,
      spaceId: intent.spaceId,
      requester: intent.requester,
      resource: intent.resourceUrl,
      amount: intent.amount,
      asset: intent.asset,
      payTo: intent.payTo,
      network: intent.network,
      expiry: String(Math.floor(new Date(intent.expiry).getTime() / 1000)),
      nonce: intent.nonce,
    },
  };
}

export function x402IntentDigest(intent) {
  const typedData = x402IntentTypedData(intent);
  return hashTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      expiry: BigInt(typedData.message.expiry),
      nonce: BigInt(typedData.message.nonce),
    },
  });
}

export async function verifyX402IntentSignature(intent, signature, { address, digest, nowMs = Date.now() } = {}) {
  const signer = String(address || '').toLowerCase();
  if (!ADDRESS.test(signer)) throw new Error('x402 intent signer must be an EVM address');
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) throw new Error('A valid x402 intent signature is required');
  if (new Date(intent.expiry).getTime() <= nowMs) throw new Error('x402 intent has expired');
  const expectedDigest = x402IntentDigest(intent);
  if (digest && String(digest).toLowerCase() !== expectedDigest.toLowerCase()) throw new Error('x402 intent digest does not match the immutable intent');
  const typedData = x402IntentTypedData(intent);
  const valid = await verifyTypedData({
    address: signer,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      expiry: BigInt(typedData.message.expiry),
      nonce: BigInt(typedData.message.nonce),
    },
    signature,
  });
  if (!valid) throw new Error('x402 intent signature does not match the authenticated signer and exact digest');
  return { digest: expectedDigest, signer };
}

export function newX402Nonce() {
  return BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString();
}

export const validateX402PaymentRequired = validateX402PaymentIntent;
export { MAX_TIMEOUT_SECONDS };
