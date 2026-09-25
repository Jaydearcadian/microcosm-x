"use client";

import { useState } from "react";
import { okLinkTxUrl } from "@/lib/contract";

/**
 * HashChip (brief §5): copy-on-click, truncated `0x6de0…f3999`, expands full
 * hash. Every chip renders the `simulated` flag (CON-06): simulated hashes say
 * so and never link out; real hashes link to OKLink. A fake hash presented as
 * real is a ship-blocker.
 */
export function HashChip({
  hash,
  simulated,
  label,
}: {
  hash: string;
  simulated: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const truncated = `0x${hash.slice(2, 6)}…${hash.slice(-5)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — expanded view still allows manual copy */
      setExpanded(true);
    }
  };

  const display = expanded ? hash : truncated;
  const explorer = simulated ? null : (
    <a
      href={okLinkTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-ui"
      style={{
        color: "var(--accent)",
        fontSize: 11,
        letterSpacing: "0.08em",
        padding: "0 4px",
      }}
    >
      OKLINK ↗
    </a>
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        padding: "6px 10px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        flexWrap: "wrap",
      }}
    >
      {label && (
        <span className="muted" style={{ fontSize: 11 }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Hash copied" : `Copy hash ${truncated}`}
        className="font-ui"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 13,
          wordBreak: expanded ? "break-all" : "normal",
          color: "var(--text)",
          minHeight: 32,
        }}
      >
        {copied ? "copied ✓" : display}
      </button>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse hash" : "Expand full hash"}
        className="font-ui"
        style={{ fontSize: 11, color: "var(--muted)", minHeight: 32 }}
      >
        {expanded ? "▲" : "▼"}
      </button>
      <span
        className="font-ui"
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          padding: "2px 6px",
          borderRadius: 999,
          border: `1px solid ${simulated ? "var(--hairline)" : "var(--accent)"}`,
          color: simulated ? "var(--muted)" : "var(--accent)",
        }}
      >
        {simulated ? "SIMULATED" : "ONCHAIN"}
      </span>
      {explorer}
    </span>
  );
}
