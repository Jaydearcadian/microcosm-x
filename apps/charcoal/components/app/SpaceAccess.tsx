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

  if (!isAuthenticated) return <section className="command-panel command-panel--wide access-panel"><div><span className="eyebrow">SPACE ACCESS</span><h2>Connect a wallet to enter a Space.</h2><p className="muted">Invites are bearer links by default and become address-bound when redeemed. No wallet means no membership mutation.</p></div></section>;
  if (!spaceId) return null;

  const issue = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await createSpaceInvitation(spaceId, { address: addressToInvite.trim() || undefined, role: "member", displayName: "Invited member" });
      setInvitation(result);
      setMessage(result.address ? `Invite restricted to ${result.address}.` : "Bearer invite created. Anyone with the link can redeem it once.");
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
  const copyLink = async () => {
    if (!invitation) return;
    await navigator.clipboard.writeText(`${window.location.origin}/app/access?code=${encodeURIComponent(invitation.code)}`);
    setMessage("Invite link copied.");
  };
  const inviteLink = invitation ? `${typeof window === "undefined" ? "" : window.location.origin}/app/access?code=${encodeURIComponent(invitation.code)}` : "";

  return <section className="command-panel command-panel--wide access-panel"><div className="command-panel__head"><span className="eyebrow">SPACE ACCESS</span><span className="muted" style={{ fontSize: 11 }}>{isAdmin ? "ADMIN INVITES" : "MEMBER REDEMPTION"}</span></div>{isAdmin ? <div className="wizard-fields"><label className="wizard-field">OPTIONAL TARGET ADDRESS<input value={addressToInvite} onChange={(event) => setAddressToInvite(event.target.value)} placeholder="Leave blank for bearer link" /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void issue()} disabled={busy}>{busy ? "ISSUING…" : "Issue invite"}</button></div></div> : <div className="wizard-fields"><label className="wizard-field">INVITE CODE<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="invite-…" /></label><div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void redeem()} disabled={busy || !inviteCode.trim()}>{busy ? "REDEEMING…" : "Redeem access"}</button></div></div>}{invitation && <div className="action-flash"><div>Invite code: <span className="font-ui">{invitation.code}</span> · expires {new Date(invitation.expiresAt).toLocaleDateString()}</div><div className="font-ui" style={{ overflowWrap: "anywhere", marginTop: 6 }}>{inviteLink}</div><button type="button" className="wizard-next" style={{ marginTop: 10 }} onClick={() => void copyLink()}>Copy invite link</button></div>}{message && <p className="wizard-result" role="status">{message}</p>}<p className="muted" style={{ fontSize: 11 }}>Connected address: {address}</p></section>;
}
