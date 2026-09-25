import crypto from 'node:crypto';

export * from './attestation.js';
export * from './governance.js';

/**
 * Converts a decimal string or number to cents (e.g. "500.00" -> 50000)
 * to avoid floating-point rounding errors.
 * @param {string|number} val
 * @returns {bigint}
 */
export function toBaseUnits(val) {
  const [whole, dec = ''] = String(val).trim().split('.');
  const paddedDec = (dec + '000000').slice(0, 6); // 6 decimals for USDC
  return BigInt(whole || '0') * 1000000n + BigInt(paddedDec);
}

/**
 * Formats base units back to decimal string.
 * @param {bigint} baseUnits
 * @returns {string}
 */
export function fromBaseUnits(baseUnits) {
  const whole = baseUnits / 1000000n;
  const rem = baseUnits % 1000000n;
  const remStr = rem.toString().padStart(6, '0');
  return `${whole}.${remStr}`;
}

/**
 * Computes a deterministic SHA-256 hash of a canonical object.
 * @param {object} obj
 * @returns {string}
 */
export function canonicalHash(obj) {
  const sorted = JSON.stringify(obj, Object.keys(obj).sort());
  return '0x' + crypto.createHash('sha256').update(sorted).digest('hex');
}

/**
 * Evaluates a payment request against a Space's configured rules.
 * Pure, deterministic, zero network calls.
 * 
 * @param {object} space
 * @param {object} request
 * @returns {{
 *   allowed: boolean,
 *   reasons: string[],
 *   denialProof?: object,
 *   approvedIntent?: object
 * }}
 */
export function evaluateSpacePayment(space, request) {
  const reasons = [];
  const requestedBase = toBaseUnits(request.amount);

  // 1. Verify Space membership and actor role. actorId may be the member id
  // or the member name (displayName) — both identify a Space member.
  const member = (space.members || []).find(
    (m) => m.id === request.actorId || m.name === request.actorId || m.address === request.actorId
  );
  if (!member) {
    reasons.push(`Actor '${request.actorId}' is not an authorized member of Space '${space.id}'`);
  } else if (!['admin', 'agent', 'operator'].includes(member.role)) {
    reasons.push(`Actor role '${member.role}' has no spending authority in this Space`);
  }

  // 2. Asset match check
  const spaceCurrency = space.currency || 'USDC';
  const requestAsset = request.asset || 'USDC';
  if (spaceCurrency !== requestAsset) {
    reasons.push(`Asset mismatch: Space operates in ${spaceCurrency}, request specified ${requestAsset}`);
  }

  // 3. Space treasury balance check
  const balanceBase = toBaseUnits(space.balance || '0');
  if (requestedBase > balanceBase) {
    reasons.push(`Insufficient Space balance: requested ${request.amount} ${requestAsset}, available ${space.balance}`);
  }

  const rules = space.rules || {};

  // 4. Per-transaction limit check (INV-S1)
  if (rules.maxPerTransaction) {
    const maxTxBase = toBaseUnits(rules.maxPerTransaction);
    if (requestedBase > maxTxBase) {
      reasons.push(
        `Exceeds Space per-transaction cap: requested ${request.amount} ${requestAsset}, max permitted is ${rules.maxPerTransaction}`
      );
    }
  }

  // 5. Daily budget check
  if (rules.dailyBudget) {
    const dailyBudgetBase = toBaseUnits(rules.dailyBudget);
    const spentTodayBase = toBaseUnits(space.totalSpentToday || '0');
    if (spentTodayBase + requestedBase > dailyBudgetBase) {
      reasons.push(
        `Exceeds Space daily budget: requested ${request.amount}, spent today ${space.totalSpentToday || '0'}, daily limit is ${rules.dailyBudget}`
      );
    }
  }

  // 6. Allowed counterparties check
  if (rules.allowedCounterparties && Array.isArray(rules.allowedCounterparties) && rules.allowedCounterparties.length > 0) {
    const normalizedAllowed = rules.allowedCounterparties.map((c) => c.toLowerCase());
    const targetRecipient = (request.recipient || '').toLowerCase();
    if (!normalizedAllowed.includes(targetRecipient)) {
      reasons.push(`Recipient '${request.recipient}' is not in the Space's approved counterparties list`);
    }
  }

  // 7. Schedule check (optional)
  if (rules.schedule) {
    const reqDate = new Date(request.timestamp || Date.now());
    const day = reqDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toLowerCase();
    const hour = reqDate.getUTCHours();

    if (rules.schedule.days && !rules.schedule.days.includes(day)) {
      reasons.push(`Payment requested on '${day}', outside of Space schedule days [${rules.schedule.days.join(', ')}]`);
    }
    if (rules.schedule.startHourUtc !== undefined && rules.schedule.endHourUtc !== undefined) {
      if (hour < rules.schedule.startHourUtc || hour >= rules.schedule.endHourUtc) {
        reasons.push(`Payment requested at ${hour}:00 UTC, outside permitted window [${rules.schedule.startHourUtc}-${rules.schedule.endHourUtc}]`);
      }
    }
  }

  // Decision outcome
  const allowed = reasons.length === 0;

  if (!allowed) {
    // Generate deterministic DenialProof (INV-S2)
    const proofPayload = {
      spaceId: space.id,
      actorId: request.actorId,
      requestedRecipient: request.recipient,
      requestedAmount: request.amount,
      asset: requestAsset,
      reasons,
      timestamp: request.timestamp || new Date().toISOString(),
      nonce: request.nonce || crypto.randomUUID(),
    };
    return {
      allowed: false,
      reasons,
      denialProof: {
        ...proofPayload,
        proofHash: canonicalHash(proofPayload),
      },
    };
  }

  // Generate Approved Payment Intent
  const intentPayload = {
    actionId: request.actionId || crypto.randomUUID(),
    spaceId: space.id,
    actorId: request.actorId,
    recipient: request.recipient,
    amount: request.amount,
    asset: requestAsset,
    approvedAt: new Date().toISOString(),
    memo: request.memo || '',
    nonce: request.nonce || crypto.randomUUID(),
  };

  return {
    allowed: true,
    reasons: [],
    approvedIntent: {
      ...intentPayload,
      authHash: canonicalHash(intentPayload),
    },
  };
}
