"use client";

import { useState } from "react";
import { createSpaceInvitation, redeemSpaceInvitation, type Invitation } from "@/lib/contract";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";

export function SpaceAccess() {
  const { space, spaceId, capabilities, refresh } = useAppData();
  const { isAuthenticated, address } = useWalletSession();
  const [addressToInvite, setAddressToInvite] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = capabilities?.actor.role === "admin";

  if (!isAuthenticated) return <section className="command-panel command-panel--wide access-panel"><div><span className="eyebrow">SPACE ACCESS</span><h2>Connect a wallet to enter a Space.</h2><p className="muted">Access is address-bound and authenticated by a signed session. No wallet means no membership mutation.</p></div></section>;
  if (!spaceId) return null;

  const issue = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await createSpaceInvitation(spaceId, { address: addressToInvite.trim(), role: "member", displayName: "Invited member" });
      setInvitation(result);
      setMessage(`Invite ready for ${result.address}. Share the one-time code.`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Invite failed."); }
    finally { setBusy(false); }
  };
  const redeem = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await redeemSpaceInvitation(inviteCode.trim());
      setMessage(`Access granted to ${result.space.name}.`);
      await refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Invite redemption failed."); }
    finally { setBusy(false); }
  };

  return <section className="command-panel command-panel--wide access-panel"><div className="command-panel__head"><span className="eyebrow">SPACE ACCESS</span><span className="muted" style={{ fontSize: 11 }}>{isAdmin ? "ADMIN INVITES" : "MEMBER REDEMPTION"}</span></div>{isAdmin ? <div className="wizard-fields"><label className="wizard-field">INVITE WALLET ADDRESS<input value={addressToInvite} onChange={(event) => setAddressToInvite(event.target.value)} placeholder="0x…" /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void issue()} disabled={busy || !addressToInvite.trim()}>{busy ? "ISSUING…" : "Issue invite"}</button></div></div> : <div className="wizard-fields"><label className="wizard-field">INVITE CODE<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="invite-…" /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void redeem()} disabled={busy || !inviteCode.trim()}>{busy ? "REDEEMING…" : "Redeem access"}</button></div></div>}{invitation && <div className="action-flash">Invite code: <span className="font-ui">{invitation.code}</span> · expires {new Date(invitation.expiresAt).toLocaleDateString()}</div>}{message && <p className="wizard-result">{message}</p>}<p className="muted" style={{ fontSize: 11 }}>Connected address: {address}</p></section>;
}
