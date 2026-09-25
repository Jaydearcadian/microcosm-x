export const CAPABILITY_MANIFEST_SCHEMA = 'microcosm.space.capability-manifest/v1';

const CAPABILITY_IDS = Object.freeze(['payment', 'work', 'request', 'court']);

function safeLimit(value) {
  return value === undefined || value === null ? null : String(value);
}

export function createCapabilityManifest(space) {
  if (!space || typeof space !== 'object') throw new Error('Space must be an object');
  const rules = space.rules && typeof space.rules === 'object' ? space.rules : {};
  return {
    schema: CAPABILITY_MANIFEST_SCHEMA,
    space: {
      id: String(space.id),
      name: String(space.name || ''),
      network: String(space.network || ''),
      chainId: Number(space.chainId),
      currency: String(space.currency || 'USDC'),
    },
    capabilities: CAPABILITY_IDS.reduce((result, id) => {
      result[id] = { id };
      return result;
    }, {}),
    policy: {
      maxPerTransaction: safeLimit(rules.maxPerTransaction),
      dailyBudget: safeLimit(rules.dailyBudget),
      allowlist: {
        type: 'counterparties',
        enabled: Array.isArray(rules.allowedCounterparties) && rules.allowedCounterparties.length > 0,
      },
    },
  };
}

export const getCapabilityManifest = createCapabilityManifest;
