"use client";

import { useState } from "react";
import { redeemSpaceInvitation } from "@/lib/contract";
import { useAppData } from "@/lib/app-data";
import { CreateSpaceFlow } from "@/components/app/CreateSpaceFlow";
import { useWalletSession } from "@/lib/wallet-session";

/**
 * What someone sees when they arrive without a Space.
 *
 * The old behaviour was a select reading "No Space yet" and eight destinations
 * they could not use. This says what is wrong in one line and offers the two
 * ways out: use an invite someone sent you, or start your own.
 *
 * It is deliberately worded as choices rather than as concepts. "Paste an
 * invite" and "Create a Space" are things you do; a bearer credential and an
 * operating context are not.
 */
export function EntryGate() {
  const { spaceId, setSpaceId, refresh } = useAppData();
  const { isConnected, isAuthenticated, authenticate, isAuthenticating, address } = useWalletSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Order matters. Creating a Space sets the selected Space, and the gate used to
  // bail out on that, which unmounted the form halfway through and threw away the
  // budget-binding step and the log of what had actually been created.
  if (creating) {
    return <CreateSpaceFlow onDone={() => { setCreating(false); void refresh(); }} />;
  }
  if (spaceId) return null;

  // Accepts a bare code, or a whole invite URL, because an invite arrives as a
  // link and asking someone to strip the code out of it is busywork.
  const extractCode = (raw: string) => {
    const value = raw.trim();
    if (!value) return "";
    const fromQuery = /[?&]code=([^&#\s]+)/.exec(value);
    if (fromQuery) return decodeURIComponent(fromQuery[1]);
    const fromPath = /\/access\/([^/?#\s]+)/.exec(value);
    if (fromPath) return fromPath[1];
    return value;
  };

  const redeem = async () => {
    const parsed = extractCode(code);
    if (!parsed) { setError("Paste the invite link or code first."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await redeemSpaceInvitation(parsed);
      setMessage(`You are in ${result.space.name}.`);
      setSpaceId(result.space.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That invite did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="entry-gate" aria-labelledby="entry-gate-title">
      <div className="entry-gate__head">
        <span className="eyebrow">Getting started</span>
        <h2 id="entry-gate-title" className="display">You are not in a Space yet.</h2>
        <p className="muted">
          A Space is one company&apos;s working area: its money, its people, the vendors it may pay,
          and every job that runs through it. You can be invited into one, or start your own.
        </p>
      </div>

      {!isConnected ? (
        <div className="entry-gate__connect">
          <strong>Start by connecting a wallet.</strong>
          <span className="muted">
            It is how we know who you are. You do not need to put any money in it to look around.
          </span>
        </div>
      ) : !isAuthenticated ? (
        <div className="entry-gate__connect">
          <strong>Wallet connected.</strong>
          <span className="muted">Sign once so we know this wallet is really yours.</span>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void authenticate().catch(() => undefined)}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? "Signing…" : "Sign in"}
          </button>
        </div>
      ) : (
        <div className="entry-gate__choices">
          <div className="entry-gate__choice">
            <h3>I was invited</h3>
            <p className="muted">
              Paste the invite link you were sent. It looks like a link, or a short code.
            </p>
            <label className="entry-gate__field">
              <span>Invite link or code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="https://…/access/abc123 or abc123"
                spellCheck={false}
                autoComplete="off"
                onKeyDown={(event) => { if (event.key === "Enter") void redeem(); }}
              />
            </label>
            <button type="button" className="btn btn--secondary" onClick={() => void redeem()} disabled={busy}>
              {busy ? "Joining…" : "Join with that invite"}
            </button>
            {error ? <p className="entry-gate__error" role="alert">{error}</p> : null}
            {message ? <p className="entry-gate__ok" role="status">{message}</p> : null}
          </div>

          <div className="entry-gate__choice">
            <h3>I am starting one</h3>
            <p className="muted">
              Name it, say what it is for, add who works in it, set what it may spend, and open a
              door for agents. About two minutes.
            </p>
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              Create a Space
            </button>
            <span className="entry-gate__as">You are signed in as {address}.</span>
          </div>
        </div>
      )}
    </section>
  );
}
