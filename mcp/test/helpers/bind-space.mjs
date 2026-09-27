import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Bind a Space's limits on a live chain, the way a Space owner would.
 *
 * SettlementRouter refuses anything from an unbound Space: nobody has signed
 * for that money leaving it. A test that wants a direct payment to succeed has
 * to sign for it first, exactly as an owner does.
 *
 * The digest is read from the contract rather than recomputed here. It is an
 * EIP-712 payload with a dynamic array inside a tuple, and reproducing that
 * encoding offchain is precisely the kind of thing that is subtly wrong and
 * signs a payload nobody intended. Asking the contract is also the cross-check
 * the contract's own comment asks callers to make.
 */
// The Binding tuple is written out by hand. viem's parseAbi does not support
// named tuple components, and an unnamed tuple takes positional values: an
// object then encodes into the wrong slots, the digest changes, and the contract
// rejects the signature as BadSignature with nothing pointing at the real
// mistake. Naming the components is what stops that.
const BINDING = {
  type: 'tuple',
  components: [
    { name: 'spaceId', type: 'bytes32' },
    { name: 'owner', type: 'address' },
    { name: 'maxPerTransaction', type: 'uint256' },
    { name: 'dailyBudget', type: 'uint256' },
    { name: 'recipients', type: 'address[]' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
};

const ABI = [
  { type: 'function', name: 'bindingDigestFor', stateMutability: 'view',
    inputs: [{ name: 'verifyingContract', type: 'address' }, { name: 'chainId', type: 'uint256' }, { name: 'binding', ...BINDING }],
    outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'bind', stateMutability: 'nonpayable',
    inputs: [{ name: 'binding', ...BINDING }, { name: 'signature', type: 'bytes' }],
    outputs: [] },
];

const REGISTER_ABI = [{
  type: 'function', name: 'registerSpaceToken', stateMutability: 'nonpayable',
  inputs: [{ name: 'spaceId', type: 'bytes32' }, { name: 'token', type: 'address' }],
  outputs: [],
}];

export async function bindSpaceOnchain({
  rpc, spaceId, owner, key, chainId, asset, recipients,
  maxPerTx = 500_000_000n, daily = 2_000_000_000n, nonce = 0n,
}) {
  const account = privateKeyToAccount(key);
  const budget = process.env.XLAYER_BUDGET_ADDRESS;
  const router = process.env.XLAYER_ROUTER_ADDRESS;
  if (!budget || !router) throw new Error('bind-space: XLAYER_BUDGET_ADDRESS and XLAYER_ROUTER_ADDRESS must be set');

  const binding = {
    spaceId,
    owner,
    maxPerTransaction: maxPerTx,
    dailyBudget: daily,
    recipients,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 365),
    nonce,
  };

  const client = createPublicClient({ transport: http(rpc) });
  const digest = await client.readContract({
    address: budget, abi: ABI, functionName: 'bindingDigestFor',
    args: [budget, BigInt(chainId), binding],
  });
  // sign({ hash }) signs the 32 bytes as they stand. signMessage would apply
  // the personal-sign prefix, which is a different payload: SpaceBudget recovers
  // with a plain ecrecover over the EIP-712 digest, so a prefixed signature
  // recovers to the wrong address and bind reverts BadSignature.
  const signature = await account.sign({ hash: digest });

  const wallet = createWalletClient({ account, transport: http(rpc) });
  // Register the asset first: the router will not settle a Space whose token it
  // does not know, and a limits binding alone is not enough.
  await wallet.writeContract({
    address: router, abi: REGISTER_ABI,
    functionName: 'registerSpaceToken', args: [spaceId, asset],
  });
  const hash = await wallet.writeContract({
    address: budget, abi: ABI, functionName: 'bind', args: [binding, signature],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`bind-space: binding reverted (${hash})`);
  return { digest, signature, txHash: hash };
}
