"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWalletSession } from "@/lib/wallet-session";

export function WalletConnect() {
  const { isConnected, isAuthenticated, isAuthenticating, authenticate, disconnect } = useWalletSession();
  return <div className="wizard-wallet"><ConnectButton showBalance={false} chainStatus="icon" />{isConnected && !isAuthenticated && <button type="button" className="wizard-run" onClick={() => void authenticate().catch(() => undefined)} disabled={isAuthenticating}>{isAuthenticating ? "SIGNING…" : "Sign session"}</button>}{isAuthenticated && <button type="button" className="wizard-next" onClick={() => void disconnect()}>Disconnect</button>}</div>;
}
