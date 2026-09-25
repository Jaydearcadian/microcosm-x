"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { createAuthSession, fetchAuthChallenge, fetchAuthSession, revokeAuthSession } from "@/lib/contract";

interface WalletSessionValue {
  address: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  error: string | null;
  authenticate: () => Promise<void>;
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

  const disconnect = useCallback(async () => {
    await revokeAuthSession().catch(() => undefined);
    setAuthenticatedAddress(null);
    disconnectWallet();
  }, [disconnectWallet]);

  const value = useMemo(() => ({ address: address || null, isConnected, isAuthenticated: Boolean(address && authenticatedAddress && authenticatedAddress.toLowerCase() === address.toLowerCase()), isAuthenticating, error, authenticate, disconnect }), [address, isConnected, authenticatedAddress, isAuthenticating, error, authenticate, disconnect]);
  return <WalletSessionContext.Provider value={value}>{children}</WalletSessionContext.Provider>;
}
