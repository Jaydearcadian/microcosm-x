import { hashTypedData, isAddress, recoverAddress } from 'viem';

export const AUTHORITY_DELEGATION_DOMAIN_NAME = 'Microcosm Authority Delegation';
export const AUTHORITY_DELEGATION_DOMAIN_VERSION = '1';
export const AUTHORITY_DELEGATION_PRIMARY_TYPE = 'AuthorityDelegation';

export const AUTHORITY_DELEGATION_TYPES = Object.freeze({
  [AUTHORITY_DELEGATION_PRIMARY_TYPE]: [
    { name: 'delegationId', type: 'string' },
    { name: 'spaceId', type: 'string' },
    { name: 'parentActor', type: 'address' },
    { name: 'child', type: 'address' },
    { name: 'parentRole', type: 'string' },
    { name: 'childRole', type: 'string' },
    { name: 'maxPerTransaction', type: 'uint256' },
    { name: 'dailyBudget', type: 'uint256' },
    { name: 'allowedCounterparties', type: 'string[]' },
    { name: 'asset', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'policySnapshotHash', type: 'bytes32' },
  ],
});

const ROLES = ['member', 'agent', 'operator', 'admin'];
const ROLE_RANK = Object.freeze({ member: 0, agent: 1, operator: 2, admin: 3 });
const UINT_MAX = (1n << 256n) - 1n;

export function authorityDelegationDomain(chainId) {
  return { name: AUTHORITY_DELEGATION_DOMAIN_NAME, version: AUTHORITY_DELEGATION_DOMAIN_VERSION, chainId: BigInt(chainId) };
}

function parseUint(value, field) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error(`${field} must be an integer uint256`);
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error(`${field} must be a non-negative uint256`);
  const parsed = BigInt(text);
  if (parsed < 0n || parsed > UINT_MAX) throw new Error(`${field} is out of uint256 range`);
  return parsed;
}

export function decimalToBaseUnits(value, field = 'amount') {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error(`${field} must be a positive decimal with at most six decimal places`);
  const [whole, fraction = ''] = text.split('.');
  const units = BigInt(whole) * 1000000n + BigInt((fraction + '000000').slice(0, 6));
  if (units <= 0n) throw new Error(`${field} must be greater than zero`);
  return units;
}

function address(value, field) {
  if (!isAddress(String(value || ''))) throw new Error(`${field} must be a valid EVM address`);
  return String(value).toLowerCase();
}

function bytes32(value, field) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value || ''))) throw new Error(`${field} must be bytes32`);
  return String(value).toLowerCase();
}

function nonEmpty(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function roles(value, field) {
  const role = nonEmpty(value, field);
  if (!ROLES.includes(role)) throw new Error(`${field} must be one of ${ROLES.join(', ')}`);
  return role;
}

function counterparties(value) {
  if (!Array.isArray(value)) throw new Error('allowedCounterparties must be an array');
  const normalized = value.map((item) => nonEmpty(item, 'counterparty').toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error('allowedCounterparties must not contain duplicates');
  return normalized;
}

export function normalizeAuthorityDelegation(delegation, { chainId } = {}) {
  if (!delegation || typeof delegation !== 'object') throw new Error('Authority delegation must be an object');
  const selectedChain = chainId ?? delegation.chainId;
  const normalizedChain = parseUint(selectedChain, 'chainId');
  const parentActor = address(delegation.parentActor ?? delegation.parent ?? delegation.parentAddress, 'parentActor');
  const child = address(delegation.child ?? delegation.childAddress, 'child');
  const max = decimalToBaseUnits(delegation.maxPerTransaction, 'maxPerTransaction');
  const dailyBudget = decimalToBaseUnits(delegation.dailyBudget, 'dailyBudget');
  const expiry = parseUint(delegation.expiry, 'expiry');
  const nonce = parseUint(delegation.nonce, 'nonce');
  return {
    delegationId: nonEmpty(delegation.delegationId, 'delegationId'),
    spaceId: nonEmpty(delegation.spaceId, 'spaceId'),
    parentActor,
    child,
    parentRole: roles(delegation.parentRole, 'parentRole'),
    childRole: roles(delegation.childRole, 'childRole'),
    maxPerTransaction: max.toString(),
    dailyBudget: dailyBudget.toString(),
    allowedCounterparties: counterparties(delegation.allowedCounterparties),
    asset: nonEmpty(delegation.asset, 'asset'),
    chainId: normalizedChain.toString(),
    nonce: nonce.toString(),
    expiry: expiry.toString(),
    policySnapshotHash: bytes32(delegation.policySnapshotHash, 'policySnapshotHash'),
  };
}

export function authorityDelegationTypedData(delegation, chainId) {
  const message = normalizeAuthorityDelegation(delegation, { chainId });
  return {
    domain: { ...authorityDelegationDomain(message.chainId), chainId: Number(message.chainId) },
    types: AUTHORITY_DELEGATION_TYPES,
    primaryType: AUTHORITY_DELEGATION_PRIMARY_TYPE,
    message,
  };
}

export function authorityDelegationDigest(delegation, chainId) {
  return hashTypedData(authorityDelegationTypedData(delegation, chainId));
}

export function validateAuthorityDelegation(delegation, { nowMs = Date.now(), chainId } = {}) {
  const reasons = [];
  let normalized = null;
  let digest = null;
  try {
    if (chainId !== undefined && delegation.chainId !== undefined && parseUint(delegation.chainId, 'chainId') !== parseUint(chainId, 'chainId')) reasons.push('Authority delegation chainId does not match the signing domain');
    normalized = normalizeAuthorityDelegation(delegation, { chainId });
    if (BigInt(normalized.expiry) * 1000n <= BigInt(Math.floor(nowMs))) reasons.push('Authority delegation has expired');
  } catch (error) {
    reasons.push(error.message);
  }
  if (normalized) {
    try {
      digest = authorityDelegationDigest(delegation, chainId);
    } catch (error) {
      reasons.push(error.message);
    }
  }
  return { valid: reasons.length === 0, reasons, normalized, digest };
}

export async function verifyAuthorityDelegationSignature({ delegation, signature, signerAddress, digest: suppliedDigest, nowMs = Date.now(), chainId } = {}) {
  const validation = validateAuthorityDelegation(delegation, { nowMs, chainId });
  if (!validation.valid) {
    const error = new Error(`Invalid authority delegation: ${validation.reasons.join('; ')}`);
    error.reasons = validation.reasons;
    throw error;
  }
  const expectedSigner = address(signerAddress, 'signerAddress');
  if (suppliedDigest && String(suppliedDigest).toLowerCase() !== validation.digest.toLowerCase()) {
    throw new Error('Authority delegation digest is tampered');
  }
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) throw new Error('Authority delegation signature must be 0x-hex');
  const recovered = String(await recoverAddress({ hash: validation.digest, signature })).toLowerCase();
  if (recovered !== expectedSigner) throw new Error('Authority delegation signature does not match parentActor');
  return { valid: true, signer: recovered, digest: validation.digest, normalized: validation.normalized };
}

export function authorityIsSubset(parent, child) {
  try {
    const parentAuthority = normalizeAuthorityDelegation(parent);
    const childAuthority = normalizeAuthorityDelegation(child);
    if (parentAuthority.spaceId !== childAuthority.spaceId) return false;
    if (parentAuthority.asset.toLowerCase() !== childAuthority.asset.toLowerCase()) return false;
    if (BigInt(parentAuthority.chainId) !== BigInt(childAuthority.chainId)) return false;
    if (BigInt(parentAuthority.maxPerTransaction) < BigInt(childAuthority.maxPerTransaction)) return false;
    if (BigInt(parentAuthority.dailyBudget) < BigInt(childAuthority.dailyBudget)) return false;
    if (BigInt(parentAuthority.expiry) < BigInt(childAuthority.expiry)) return false;
    if (ROLE_RANK[childAuthority.childRole] > ROLE_RANK[parentAuthority.parentRole]) return false;
    const parentSet = new Set(parentAuthority.allowedCounterparties.map((item) => item.toLowerCase()));
    if (childAuthority.allowedCounterparties.some((item) => !parentSet.has(item.toLowerCase()))) return false;
    return true;
  } catch {
    return false;
  }
}

export function authoritySubsetProof(parent, child) {
  const parentAuthority = normalizeAuthorityDelegation(parent);
  const childAuthority = normalizeAuthorityDelegation(child);
  const reasons = [];
  if (parentAuthority.spaceId !== childAuthority.spaceId) reasons.push('Space mismatch');
  if (parentAuthority.asset.toLowerCase() !== childAuthority.asset.toLowerCase()) reasons.push('Asset mismatch');
  if (BigInt(parentAuthority.chainId) !== BigInt(childAuthority.chainId)) reasons.push('Chain mismatch');
  if (BigInt(parentAuthority.maxPerTransaction) < BigInt(childAuthority.maxPerTransaction)) reasons.push('Per-transaction cap expansion');
  if (BigInt(parentAuthority.dailyBudget) < BigInt(childAuthority.dailyBudget)) reasons.push('Daily budget expansion');
  if (BigInt(parentAuthority.expiry) < BigInt(childAuthority.expiry)) reasons.push('Expiry expansion');
  if (ROLE_RANK[childAuthority.childRole] > ROLE_RANK[parentAuthority.parentRole]) reasons.push('Role escalation');
  const parentSet = new Set(parentAuthority.allowedCounterparties);
  if (childAuthority.allowedCounterparties.some((item) => !parentSet.has(item))) reasons.push('Counterparty expansion');
  const payload = { parent: parentAuthority, child: childAuthority };
  return { valid: reasons.length === 0, reasons, parentDigest: authorityDelegationDigest(parentAuthority), childDigest: authorityDelegationDigest(childAuthority), payload };
}

export const authorityDelegationValidation = validateAuthorityDelegation;
export const authorityDelegationDigestOf = authorityDelegationDigest;
