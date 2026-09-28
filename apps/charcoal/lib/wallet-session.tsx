"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useDisconnect, useSignMessage, useSignTypedData } from "wagmi";
import { createAuthSession, fetchAuthChallenge, fetchAuthSession, revokeAuthSession } from "@/lib/contract";

interface WalletSessionValue {
  address: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  authenticate: () => Promise<void>;
  /**
   * Sign 32 bytes exactly as given, with no EIP-191 prefix.
   *
   * `signMessageAsync` on its own applies the personal-sign prefix, which
   * produces a different payload. SpaceBudget recovers with a plain ecrecover
   * over an EIP-712 digest, so a prefixed signature recovers to the wrong
   * address and the bind reverts as BadSignature — pointing at the signer
   * rather than at the encoding.
   */
  signDigestAsync: (digest: `0x${string}`) => Promise<`0x${string}`>;
  /** Sign EIP-712 typed data, which is what the limits contract verifies. */
  signLimitsAsync: (typedData: unknown) => Promise<`0x${string}`>;
  disconnect: () => Promise<void>;
}

const WalletSessionContext = createContext<WalletSessionValue | null>(null);
export const useWalletSession = () => {
  const value = useContext(WalletSessionContext);
  if (!value) throw new Error("useWalletSession outside WalletSessionProvider");
  return value;
};

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const [authenticatedAddress, setAuthenticatedAddress] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void fetchAuthSession().then((session) => {
      if (active) setAuthenticatedAddress(session.authenticated ? session.address : null);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Session check failed.");
    });
    return () => { active = false; };
  }, [address]);

  const authenticate = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet before authenticating.");
    setIsAuthenticating(true);
    setError(null);
    try {
      const challenge = await fetchAuthChallenge(address);
      const signature = await signMessageAsync({ message: challenge.message });
      const session = await createAuthSession(address, signature);
      setAuthenticatedAddress(session.address);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Wallet authentication failed.";
      setError(message);
      throw reason;
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync]);

  const signDigestAsync = useCallback(
    async (digest: `0x${string}`) => {
      if (!address) throw new Error("Connect a wallet before signing.");
      return signMessageAsync({ message: { raw: digest } });
    },
    [address, signMessageAsync],
  );

  const signLimitsAsync = useCallback(
    async (typedData: unknown) => {
      if (!address) throw new Error("Connect a wallet before signing.");
      return signTypedDataAsync({
        domain: (typedData as { domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` } }).domain,
        types: (typedData as { types: Record<string, Array<{ name: string; type: string }>> }).types,
        primaryType: (typedData as { primaryType: string }).primaryType,
        message: (typedData as { message: Record<string, unknown> }).message,
      });
    },
    [address, signTypedDataAsync],
  );

  const disconnect = useCallback(async () => {
    await revokeAuthSession().catch(() => undefined);
    setAuthenticatedAddress(null);
    disconnectWallet();
  }, [disconnectWallet]);

  const value = useMemo(() => ({ address: address || null, isConnected, isAuthenticated: Boolean(address && authenticatedAddress && authenticatedAddress.toLowerCase() === address.toLowerCase()), isAuthenticating, error, authenticate, signDigestAsync, signLimitsAsync, disconnect }), [address, isConnected, authenticatedAddress, isAuthenticating, error, authenticate, signDigestAsync, signLimitsAsync, disconnect]);
  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}
