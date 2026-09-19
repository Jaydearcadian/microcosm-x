/**
 * Offchain EIP-712 attestation helpers for the Microcosm Space protocol.
 *
 * Mirrors the onchain verifier in `SettlementRouter.sol` /
 * `AgenticCommerce.sol` byte-for-byte:
 *   domain:  EIP712Domain(name "Microcosm", version "1", chainId, verifyingContract)
 *   message: PaymentAuthorization(bytes32 spaceId, address recipient,
 *            uint256 amount, uint256 nonce, uint256 deadline,
 *            bytes32 deliverableHash)
 *
 * Agents and relayers build the digest here; contracts verify the
 * signature via ecrecover before releasing funds. Pure, deterministic,
 * zero network calls, zero dependencies (embedded Keccak-256).
 */

// ---------------------------------------------------------------------------
// Keccak-256 (Ethereum variant, pad10*1 domain 0x01). Pure BigInt port of
// the Keccak-f[1600] permutation; validated against official test vectors.
// ---------------------------------------------------------------------------

const MASK64 = (1n << 64n) - 1n;

const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

const KECCAK_ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl64(v, n) {
  const b = BigInt(n);
  if (b === 0n) return v & MASK64;
  return (((v << b) | (v >> (64n - b))) & MASK64);
}

function keccakF(s) {
  const C = new Array(5);
  const D = new Array(5);
  const B = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) {
      C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] ^= D[x];
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(s[x + 5 * y], KECCAK_ROT[x][y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        s[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK64) & B[((x + 2) % 5) + 5 * y]);
      }
    }
    s[0] ^= KECCAK_RC[round];
  }
}

/**
 * Keccak-256 digest of a byte array. Returns 32 raw bytes (Uint8Array).
 * @param {Uint8Array} message
 * @returns {Uint8Array}
 */
export function keccak256Bytes(message) {
  const RATE = 136; // bytes (1088-bit rate for 256-bit output)
  const msg = Uint8Array.from(message);
  // pad10*1 with Keccak domain suffix 0x01
  const paddedLen = Math.floor(msg.length / RATE + 1) * RATE;
  const padded = new Uint8Array(paddedLen);
  padded.set(msg);
  padded[msg.length] = 0x01;
  padded[paddedLen - 1] |= 0x80;

  const s = new Array(25).fill(0n);
  const view = new DataView(padded.buffer);
  for (let off = 0; off < paddedLen; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      s[i] ^= view.getBigUint64(off + i * 8, true);
    }
    keccakF(s);
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) {
    outView.setBigUint64(i * 8, s[i], true);
  }
  return out;
}

function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex).toLowerCase().startsWith('0x') ? String(hex).slice(2) : String(hex);
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error(`Invalid hex string '${hex}'`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Keccak-256 of a hex string, UTF-8 string, or byte array. Returns 0x-hex.
 * @param {string|Uint8Array} input
 */
export function keccak256(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (typeof input === 'string' && input.startsWith('0x')) {
    bytes = hexToBytes(input);
  } else if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    throw new Error('keccak256 input must be a 0x-hex string, UTF-8 string, or Uint8Array');
  }
  return bytesToHex(keccak256Bytes(bytes));
}

// ---------------------------------------------------------------------------
// EIP-712 PaymentAuthorization encoding (matches SettlementRouter.sol)
// ---------------------------------------------------------------------------

export const ATTESTATION_DOMAIN_NAME = 'Microcosm';
export const ATTESTATION_DOMAIN_VERSION = '1';

export const EIP712_DOMAIN_TYPEHASH = keccak256(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
);
export const PAYMENT_AUTH_TYPEHASH = keccak256(
  'PaymentAuthorization(bytes32 spaceId,address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 deliverableHash)'
);

function encodeUint256(value) {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  if (n < 0n || n >= 1n << 256n) {
    throw new Error(`Value out of uint256 range: '${value}'`);
  }
  return n.toString(16).padStart(64, '0');
}

function encodeAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address '${value}'`);
  }
  return '0'.repeat(24) + value.slice(2).toLowerCase();
}

function encodeBytes32(value) {
  const bytes = hexToBytes(value);
  if (bytes.length !== 32) {
    throw new Error(`Invalid bytes32 '${value}'`);
  }
  return bytesToHex(bytes).slice(2).toLowerCase();
}

function abiEncode(words) {
  return '0x' + words.join('');
}

/**
 * EIP-712 domain separator for a verifying contract on a chain.
 * @param {number|string|bigint} chainId
 * @param {string} verifyingContract 0x address
 */
export function attestationDomainSeparator(chainId, verifyingContract) {
  return keccak256(
    abiEncode([
      EIP712_DOMAIN_TYPEHASH.slice(2),
      keccak256(ATTESTATION_DOMAIN_NAME).slice(2),
      keccak256(ATTESTATION_DOMAIN_VERSION).slice(2),
      encodeUint256(chainId),
      encodeAddress(verifyingContract),
    ])
  );
}

/**
 * EIP-712 struct hash of a PaymentAuthorization.
 * @param {{spaceId:string,recipient:string,amount:number|string|bigint,nonce:number|string|bigint,deadline:number|string|bigint,deliverableHash:string}} auth
 */
export function paymentAuthStructHash(auth) {
  return keccak256(
    abiEncode([
      PAYMENT_AUTH_TYPEHASH.slice(2),
      encodeBytes32(auth.spaceId),
      encodeAddress(auth.recipient),
      encodeUint256(auth.amount),
      encodeUint256(auth.nonce),
      encodeUint256(auth.deadline),
      encodeBytes32(auth.deliverableHash),
    ])
  );
}

/**
 * Final EIP-712 digest to sign: keccak256(0x1901 || domain || structHash).
 * This is the exact preimage `ecrecover` verifies onchain.
 */
export function attestationDigest({ chainId, verifyingContract, auth }) {
  const domain = attestationDomainSeparator(chainId, verifyingContract).slice(2);
  const structHash = paymentAuthStructHash(auth).slice(2);
  return keccak256(hexToBytes(`0x1901${domain}${structHash}`));
}

/**
 * Validate an authorization's shape. Returns a list of reasons (empty = valid).
 */
export function validateAuthorizationShape(auth) {
  const reasons = [];
  if (!auth || typeof auth !== 'object') {
    return ['Authorization must be an object'];
  }
  try {
    encodeBytes32(auth.spaceId);
  } catch {
    reasons.push(`Invalid spaceId '${auth.spaceId}': must be 0x bytes32`);
  }
  try {
    encodeAddress(auth.recipient);
  } catch {
    reasons.push(`Invalid recipient '${auth.recipient}': must be a 0x address`);
  }
  for (const field of ['amount', 'nonce', 'deadline']) {
    try {
      const n = BigInt(auth[field]);
      if (n < 0n || n >= 1n << 256n) throw new Error('range');
      if (field === 'amount' && n <= 0n) reasons.push('Amount must be greater than zero');
    } catch {
      reasons.push(`Invalid ${field} '${auth[field]}': must be a uint256`);
    }
  }
  try {
    encodeBytes32(auth.deliverableHash);
  } catch {
    reasons.push(`Invalid deliverableHash '${auth.deliverableHash}': must be 0x bytes32`);
  }
  return reasons;
}

/**
 * Liveness check: the authorization deadline (unix seconds) is in the future.
 */
export function isAuthorizationLive(auth, nowMs = Date.now()) {
  const deadlineSec = Number(auth.deadline);
  if (!Number.isFinite(deadlineSec)) return false;
  return deadlineSec * 1000 > nowMs;
}
