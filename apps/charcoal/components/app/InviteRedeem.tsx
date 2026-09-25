"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { redeemSpaceInvitation } from "@/lib/contract";
import { useWalletSession } from "@/lib/wallet-session";

export function InviteRedeem({ code = "" }: { code?: string }) {
  const { isConnected, isAuthenticated, authenticate, isAuthenticating, address } = useWalletSession();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    if (!code) { setStatus("This invite link is missing its code."); return; }
    setBusy(true); setStatus(null);
    try {
      const result = await redeemSpaceInvitation(code);
      setStatus(`Access granted to ${result.space.name}.`);
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : "Invite redemption failed."); }
    finally { setBusy(false); }
  };

  return <div className="app-view access-page"><header className="app-view__header"><div><span className="eyebrow">SPACE ACCESS</span><h1 className="display">Join the Space.</h1><p>This invite is a bearer credential until you redeem it with your wallet.</p></div><ConnectButton showBalance={false} chainStatus="icon" /></header><div className="command-panel access-panel"><div className="wizard-readout"><strong>{code || "No invite code"}</strong><span>{isAuthenticated ? `Connected as ${address}` : isConnected ? "Wallet connected; sign your session to continue" : "Connect a wallet to continue"}</span></div>{isConnected && !isAuthenticated && <button type="button" className="wizard-run" onClick={() => void authenticate().catch(() => undefined)} disabled={isAuthenticating}>{isAuthenticating ? "SIGNING…" : "Sign session"}</button>}{isAuthenticated && <button type="button" className="wizard-run" onClick={() => void redeem()} disabled={busy || !code}>{busy ? "REDEEMING…" : "Redeem invite"}</button>}{status && <p className="wizard-result">{status}</p>}{status?.startsWith("Access granted") && <a className="wizard-next" href="/app#command" style={{ display: "inline-flex", alignItems: "center", marginTop: 16 }}>Open Space</a>}</div></div>;
}
