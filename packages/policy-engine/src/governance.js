import { hashTypedData, isAddress, keccak256, recoverAddress, toBytes } from 'viem';

export const GOVERNANCE_DOMAIN_NAME = 'Microcosm Governance';
export const GOVERNANCE_DOMAIN_VERSION = '1';
export const GOVERNANCE_APPROVAL_PRIMARY_TYPE = 'GovernancePaymentApproval';

export const GOVERNANCE_APPROVAL_TYPES = Object.freeze({
  [GOVERNANCE_APPROVAL_PRIMARY_TYPE]: [
    { name: 'requestId', type: 'string' },
    { name: 'spaceId', type: 'string' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'asset', type: 'string' },
    { name: 'memo', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'policyHash', type: 'bytes32' },
  ],
});

export function governanceDomain(chainId) {
  return {
    name: GOVERNANCE_DOMAIN_NAME,
    version: GOVERNANCE_DOMAIN_VERSION,
    chainId: BigInt(chainId),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function governancePolicyHash(snapshot) {
  return keccak256(toBytes(JSON.stringify(stableValue(snapshot))));
}

function uint(value) {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= 1n << 256n) throw new Error(`Value out of uint256 range: '${value}'`);
  return parsed;
}

function bytes32(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid bytes32 '${value}'`);
  }
  return value.toLowerCase();
}

export function validateGovernanceConfig(config) {
  const reasons = [];
  if (!config || typeof config !== 'object') return ['Governance config must be an object'];
  if (config.enabled !== true) reasons.push('Governance must be explicitly enabled');
  if (!Number.isInteger(config.threshold) || config.threshold < 1) reasons.push('Governance threshold must be a positive integer');
  if (!Array.isArray(config.signerAllowlist) || config.signerAllowlist.length === 0) {
    reasons.push('Governance signerAllowlist must be a non-empty array');
  } else {
    const normalized = config.signerAllowlist.map((address) => String(address || '').toLowerCase());
    if (normalized.some((address) => !isAddress(address))) reasons.push('Governance signerAllowlist must contain only EVM addresses');
    if (new Set(normalized).size !== normalized.length) reasons.push('Governance signerAllowlist must not contain duplicates');
    if (Number.isInteger(config.threshold) && config.threshold > normalized.length) reasons.push('Governance threshold cannot exceed signer allowlist size');
  }
  return reasons;
}

export function normalizeGovernanceApprovalMessage(message) {
  if (!message || typeof message !== 'object') throw new Error('Governance approval message must be an object');
  if (typeof message.requestId !== 'string' || !message.requestId) throw new Error('Governance requestId must be non-empty');
  if (typeof message.spaceId !== 'string' || !message.spaceId) throw new Error('Governance spaceId must be non-empty');
  if (!isAddress(message.recipient)) throw new Error(`Invalid governance recipient '${message.recipient}'`);
  const amount = uint(message.amount);
  if (amount <= 0n) throw new Error('Governance amount must be greater than zero');
  if (typeof message.asset !== 'string' || !message.asset) throw new Error('Governance asset must be non-empty');
  if (typeof message.memo !== 'string') throw new Error('Governance memo must be a string');
  const nonce = uint(message.nonce);
  const deadline = uint(message.deadline);
  const policyHash = bytes32(message.policyHash);
  return { requestId: message.requestId, spaceId: message.spaceId, recipient: String(message.recipient).toLowerCase(), amount, asset: message.asset, memo: message.memo, nonce, deadline, policyHash };
}

export function governanceApprovalTypedData(message, chainId) {
  const primary = normalizeGovernanceApprovalMessage(message);
  return {
    domain: { ...governanceDomain(chainId), chainId: Number(chainId) },
    types: GOVERNANCE_APPROVAL_TYPES,
    primaryType: GOVERNANCE_APPROVAL_PRIMARY_TYPE,
    message: { ...primary, amount: primary.amount.toString(), nonce: primary.nonce.toString(), deadline: primary.deadline.toString() },
  };
}

export function governancePaymentDigest(message, chainId) {
  return hashTypedData(governanceApprovalTypedData(message, chainId));
}

export async function validateGovernanceApproval({ approval, request, chainId, signerAllowlist, nowMs = Date.now() }) {
  const reasons = [];
  if (!approval || typeof approval !== 'object') return { valid: false, reasons: ['Governance approval must be an object'], signer: null, digest: null };
  if (!request || typeof request !== 'object') return { valid: false, reasons: ['Governance request must be an object'], signer: null, digest: null };
  let signer = null;
  try {
    if (!isAddress(approval.signerAddress)) throw new Error(`Invalid governance signer '${approval.signerAddress}'`);
    signer = String(approval.signerAddress).toLowerCase();
  } catch (err) {
    reasons.push(err.message);
  }
  if (signer && (!Array.isArray(signerAllowlist) || !signerAllowlist.map((address) => String(address).toLowerCase()).includes(signer))) {
    reasons.push(`Governance signer '${signer}' is not authorized`);
  }
  let digest = null;
  try {
    const expectedDigest = governancePaymentDigest(request.approval, chainId);
    digest = expectedDigest;
    if (approval.digest && String(approval.digest).toLowerCase() !== expectedDigest) reasons.push('Governance approval digest is tampered');
    if (BigInt(request.approval.deadline) * 1000n <= BigInt(nowMs)) reasons.push('Governance request has expired');
    if (!/^0x[0-9a-fA-F]+$/.test(String(approval.signature || ''))) throw new Error('Governance signature must be 0x-hex');
    const recovered = await recoverAddress({ hash: expectedDigest, signature: approval.signature });
    if (String(recovered).toLowerCase() !== signer) reasons.push('Governance signature does not match the requested signer');
  } catch (err) {
    reasons.push(err.message);
  }
  return { valid: reasons.length === 0, reasons, signer, digest };
}
