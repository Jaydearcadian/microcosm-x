import crypto from 'node:crypto';

export * from './attestation.js';
export * from './governance.js';
export * from './capability-manifest.js';
export * from './delegation.js';

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
/**
 * The limits that actually apply to one payment.
 *
 * A delegated agent never gets the Space's own numbers. Its delegation is a
 * ceiling, not a starting point, so the two are intersected: the lower cap
 * wins, and a recipient has to be on both lists. A delegation that was more
 * generous than the Space therefore cannot widen it, which is the only way
 * this is safe to hand to something we do not control.
 */
export function effectivePaymentLimits(space, delegation) {
  const rules = space.rules || {};
  // Returns the binding value and which side it came from. The source matters
  // to the person reading a refusal: if the Space rule stopped it they raise
  // the Space rule, and if the delegation stopped it they raise the delegation.
  // Comparing in base units but handing back the original decimal, because the
  // callers run these through toBaseUnits again.
  const pickLower = (spaceValue, delegationValue) => {
    if (spaceValue == null || spaceValue === '') return { value: delegationValue, source: 'delegation' };
    if (delegationValue == null || delegationValue === '') return { value: spaceValue, source: 'space' };
    return toBaseUnits(spaceValue) <= toBaseUnits(delegationValue)
      ? { value: spaceValue, source: 'space' }
      : { value: delegationValue, source: 'delegation' };
  };
  const out = {
    maxPerTransaction: rules.maxPerTransaction ?? null,
    dailyBudget: rules.dailyBudget ?? null,
    allowedCounterparties: Array.isArray(rules.allowedCounterparties)
      ? rules.allowedCounterparties.map((c) => c.toLowerCase())
      : null,
    capSource: { maxPerTransaction: 'space', dailyBudget: 'space' },
  };
  if (!delegation) return out;

  const max = pickLower(out.maxPerTransaction, delegation.maxPerTransaction);
  out.maxPerTransaction = max.value;
  out.capSource.maxPerTransaction = max.source;
  const daily = pickLower(out.dailyBudget, delegation.dailyBudget);
  out.dailyBudget = daily.value;
  out.capSource.dailyBudget = daily.source;

  const delegationSet = (delegation.allowedCounterparties || []).map((c) => c.toLowerCase());
  // An absent Space list means unrestricted, so it cannot narrow anything. A
  // present one intersects: the agent is limited to what both agree on.
  out.allowedCounterparties = out.allowedCounterparties == null
    ? delegationSet
    : out.allowedCounterparties.filter((c) => delegationSet.includes(c));
  return out;
}

/**
 * Find the member an actorId refers to.
 *
 * Addresses are compared case-insensitively. Wallets hand back checksummed
 * addresses while the store keeps them lowercased, so an exact string match
 * silently failed to find the member and fell through to somebody else with
 * the same address in a different case — which is how a Space admin ended up
 * being resolved as an agent.
 */
export function findSpaceMember(space, actorId) {
  const wanted = String(actorId ?? '').toLowerCase();
  return (space.members || []).find(
    (m) =>
      m.id === actorId ||
      m.name === actorId ||
      (!!m.address && String(m.address).toLowerCase() === wanted),
  );
}

export function evaluateSpacePayment(space, request) {
  const reasons = [];
  const requestedBase = toBaseUnits(request.amount);

  // 1. Verify Space membership and actor role. actorId may be the member id,
  // the member name (displayName), or the member address.
  const member = findSpaceMember(space, request.actorId);
  if (!member) {
    reasons.push(`Actor '${request.actorId}' is not an authorized member of Space '${space.id}'`);
  } else if (!['admin', 'agent', 'operator'].includes(member.role)) {
    reasons.push(`Actor role '${member.role}' has no spending authority in this Space`);
  }

  // 1b. An agent is a machine holding someone else's authority, so it has to
  // arrive with that authority attached. Without this step a name in an
  // unauthenticated request body was all that stood between a caller and the
  // Space treasury. Humans (admin, operator) are identified by their session
  // instead and are deliberately not asked for a delegation.
  const isAgent = member?.role === 'agent';
  const delegation = request.delegation || null;
  if (isAgent) {
    if (!delegation) {
      reasons.push(
        `Agent '${request.actorId}' presented no signed delegation: an agent may only spend under authority its Space owner signed`,
      );
    } else if (!member.address) {
      reasons.push(
        `Agent '${request.actorId}' has no address on this Space, so no delegation can be bound to it`,
      );
    } else if (String(delegation.child || '').toLowerCase() !== String(member.address).toLowerCase()) {
      reasons.push(
        `Delegation is addressed to '${delegation.child}', but agent '${request.actorId}' is '${member.address}'`,
      );
    }
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

  // The limits that actually bind this payment: the Space's own, intersected
  // with the agent's delegation when there is one.
  const rules = effectivePaymentLimits(space, isAgent ? delegation : null);

  // 4. Per-transaction limit check (INV-S1)
  if (rules.maxPerTransaction) {
    const maxTxBase = toBaseUnits(rules.maxPerTransaction);
    if (requestedBase > maxTxBase) {
      reasons.push(
        `Exceeds ${rules.capSource.maxPerTransaction === 'delegation' ? 'agent' : 'Space'} per-transaction cap: requested ${request.amount} ${requestAsset}, max permitted is ${rules.maxPerTransaction}`
      );
    }
  }

  // 5. Daily budget check
  // 5. The Space's own daily budget, measured against the Space's own spend.
  //
  // This deliberately reads space.rules, not the intersected limits. The
  // intersected dailyBudget belongs to the agent's delegation, and comparing
  // the Space-wide total against it charged every agent for the others'
  // spending — the second agent to use a delegation was refused because the
  // first one had already spent.
  const spaceDaily = space.rules?.dailyBudget;
  if (spaceDaily) {
    const spaceDailyBase = toBaseUnits(spaceDaily);
    const spaceSpent = toBaseUnits(space.totalSpentToday || '0');
    if (spaceSpent + requestedBase > spaceDailyBase) {
      reasons.push(
        `Exceeds Space daily budget: requested ${request.amount}, spent today ${space.totalSpentToday || '0'}, daily limit is ${spaceDaily}`
      );
    }
  }

  // 5b. And separately, a delegated agent's own allowance, measured against
  // what that agent has spent. A second ceiling rather than a replacement: both
  // have to hold, so two agents cannot eat one another's budget, and neither
  // can spend past what the Space itself allows.
  if (isAgent && delegation) {
    const agentDaily = toBaseUnits(delegation.dailyBudget);
    const agentSpent = toBaseUnits(request.actorSpentToday || '0');
    if (agentSpent + requestedBase > agentDaily) {
      reasons.push(
        `Exceeds agent daily budget: requested ${request.amount}, this agent has spent ${request.actorSpentToday || '0'} today, its delegation allows ${delegation.dailyBudget}`
      );
    }
  }

  // 6. Allowed counterparties check.
  //
  // A present allowlist is authoritative even when it is empty. The previous
  // guard also required `length > 0`, which meant an empty list skipped the
  // check entirely and every Space created through the API could pay any
  // address. That is the exact boundary this product exists to hold, so an
  // empty list now denies everything rather than allowing everything.
  //
  // Only a Space whose rules omit the key altogether is unrestricted, and that
  // is the one case that has to be opted into deliberately.
  if (Array.isArray(rules.allowedCounterparties)) {
    const normalizedAllowed = rules.allowedCounterparties.map((c) => c.toLowerCase());
    const targetRecipient = (request.recipient || '').toLowerCase();
    if (!normalizedAllowed.includes(targetRecipient)) {
      reasons.push(
        normalizedAllowed.length === 0
          ? `Recipient '${request.recipient}' cannot be paid: this Space has approved no counterparties yet`
          : `Recipient '${request.recipient}' is not in the Space's approved counterparties list`,
      );
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
