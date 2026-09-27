import { ensureChain } from '/opt/microcosm-x/mcp/test/helpers/chain.mjs';
const c = await ensureChain({ port: 18610 });
console.log(JSON.stringify({ rpc: c.rpc, chainId: c.chainId, contracts: c.contracts, key: c.keys.deployer }));
