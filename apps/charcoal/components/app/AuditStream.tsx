"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAppData } from "@/lib/app-data";
import { API_BASE, fetchActivity, type Activity } from "@/lib/contract";

/* The event types the stream is subscribed to by name, as well as through the
   default `message` channel: the API names each event, so a subscriber that
   only listened for `message` would miss the named ones. */
const EVENT_TYPES = [
  "SPACE_CREATED",
  "SPACE_FUNDED",
  "PARTICIPANT_ADDED",
  "PARTICIPANT_REMOVED",
  "REQUEST_CREATED",
  "REQUEST_ACCEPTED",
  "REQUEST_COMPLETED",
  "REQUEST_BLOCKED",
  "REQUEST_CANCELLED",
  "WORK_CREATED",
  "WORK_DENIED",
  "WORK_SUBMITTED",
  "WORK_COMPLETED",
  "WORK_REJECTED",
  "WORK_EXPIRED",
  "WORK_ADJUDICATION_REQUESTED",
  "WORK_ADJUDICATION_RESOLVED",
  "PAYMENT_SETTLED",
  "PAYMENT_DENIED",
];

const money = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(parsed);
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const isDenial = (type: string) => type.includes("DENIED");
const isSettle = (type: string) => type.includes("SETTLED") || type.includes("COMPLETED");

/** "WORK_BUDGET_SET" → "work budget set", capitalised in CSS. The event name
 *  is a schema constant, not copy, so it is set as a small label. */
const typeLabel = (type: string) => type.toLowerCase().replaceAll("_", " ");

type StreamEnvelope = { seq?: number; type?: string; payload?: Record<string, unknown> };

export function AuditStream() {
  const { spaceId, activity, nextCursor, jobs } = useAppData();
  const [items, setItems] = useState<Activity[]>(activity);
  const [cursor, setCursor] = useState(nextCursor);
  const [streamState, setStreamState] = useState<"waiting" | "live" | "reconnecting">("waiting");
  const [flash, setFlash] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  /* The ledger's own words for a work order, keyed by its id. A stream row
     that leads with `onchain-1952-cdddcdc4-80` is a database dump; the same
     row leading with the description somebody typed is an audit trail. */
  const descriptions = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const job of jobs) {
      const title = job.description?.trim();
      if (title) lookup.set(job.jobId, title);
    }
    return lookup;
  }, [jobs]);

  useEffect(() => {
    setItems(activity);
    setCursor(nextCursor);
  }, [activity, nextCursor]);

  useEffect(() => {
    if (!spaceId) {
      setStreamState("waiting");
      return;
    }
    const source = new EventSource(
      `${API_BASE}/api/spaces/${encodeURIComponent(spaceId)}/events?since=${nextCursor}`,
      { withCredentials: true },
    );
    esRef.current = source;
    source.onopen = () => setStreamState("live");
    source.onerror = () => setStreamState("reconnecting");
    const onEvent = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as StreamEnvelope;
        const payload =
          parsed.payload && typeof parsed.payload === "object"
            ? { ...parsed.payload, seq: parsed.seq ?? 0, type: parsed.type ?? "UNKNOWN" }
            : (parsed as unknown as Activity);
        setItems((current) =>
          current.some((item) => item.seq === payload.seq && item.type === payload.type)
            ? current
            : [payload, ...current].slice(0, 100),
        );
        if (typeof payload.seq === "number") setCursor((current) => Math.max(current, payload.seq + 1));
        if (isSettle(payload.type)) setFlash("SETTLED · funds moved with receipt proof");
        else if (isDenial(payload.type)) setFlash("DENIED · policy proof recorded");
        if (payload.type) setTimeout(() => setFlash(null), 2400);
      } catch {
        setStreamState("reconnecting");
      }
    };
    source.addEventListener("message", onEvent);
    EVENT_TYPES.forEach((type) => source.addEventListener(type, onEvent));
    return () => {
      source.close();
      esRef.current = null;
    };
  }, [spaceId, nextCursor]);

  const loadMore = async () => {
    setPageError(null);
    try {
      const next = await fetchActivity(spaceId, 50, cursor);
      setItems((current) => [
        ...next.activity,
        ...current.filter((item) => !next.activity.some((entry) => entry.seq === item.seq)),
      ]);
      setCursor(next.nextCursor);
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Unable to load older activity.");
    }
  };

  /** The human line: the work order's own description where the event has one,
   *  otherwise the first policy reason, which is the most explanatory sentence
   *  the ledger produces. */
  const detailFor = (item: Activity) => {
    const jobId = text(item.jobId);
    if (jobId && descriptions.has(jobId)) return descriptions.get(jobId) as string;
    const description = text(item.description);
    if (description) return description;
    const reasons = item.reasons;
    if (Array.isArray(reasons) && typeof reasons[0] === "string" && reasons[0].trim()) {
      return reasons[0].trim();
    }
    const title = text(item.title);
    if (title) return title;
    const reason = text(item.reason);
    if (reason && !reason.startsWith("0x") && reason.length <= 80) return reason;
    const requestId = text(item.requestId);
    if (requestId) return requestId;
    return "Ledger event with no subject recorded.";
  };

  /** The machine identifier an event actually carries, demoted to the second
   *  line and truncated. A refusal carries no job, so it carries the hash of
   *  its own proof instead. */
  const secondaryFor = (item: Activity) => {
    const jobId = text(item.jobId);
    if (jobId) return jobId;
    const actionId = text(item.actionId);
    if (actionId) return actionId;
    const proof = item.denialProof as { proofHash?: unknown } | null | undefined;
    return text(proof?.proofHash);
  };

  const amountFor = (item: Activity) => {
    const direct = money(item.amount);
    if (direct) return direct;
    const proof = item.denialProof as { requestedAmount?: unknown } | null | undefined;
    return proof?.requestedAmount === undefined ? null : money(proof.requestedAmount);
  };

  const streamLabel =
    streamState === "live" ? "SSE LIVE" : streamState === "reconnecting" ? "SSE RECONNECTING" : "SSE WAITING";

  return (
    <section className="panel" id="audit">
      <div className="panel__head">
        <h2 className="panel__title">LIVE ACTIVITY</h2>
        <span className={`status-pill status-pill--${streamState === "live" ? "active" : "quiet"}`}>
          {streamLabel}
        </span>
      </div>

      <div className="panel__body">
        {flash ? (
          <div className={`view-flash${flash.startsWith("DENIED") ? " view-flash--danger" : ""}`}>{flash}</div>
        ) : null}
        {pageError ? <div className="view-flash view-flash--danger">{pageError}</div> : null}

        <div className="audit-list">
          {items.length === 0 ? (
            <div className="audit-empty">
              <strong>No activity yet</strong>
              <p>The stream appends the first event here as soon as the Space writes one.</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                className={`audit-row${isDenial(item.type) ? " audit-row--denial" : isSettle(item.type) ? " audit-row--settle" : ""}`}
                key={`${item.seq}-${item.type}`}
              >
                <span className="audit-row__seq">{String(item.seq).padStart(3, "0")}</span>
                <span className="audit-row__type">{typeLabel(item.type)}</span>
                <span className="audit-row__amount">{amountFor(item)}</span>
                <span className="audit-row__detail clamp-2">{detailFor(item)}</span>
                <span className="audit-row__id">{secondaryFor(item)}</span>
              </div>
            ))
          )}
        </div>

        <div className="audit-foot">
          <span className="audit-foot__cursor tnum">
            Cursor {cursor} · {items.length} rows loaded ·{" "}
            {streamState === "live" ? "updates continue over SSE" : "the stream will retry"}
          </span>
          <div className="audit-foot__actions">
            <button type="button" className="btn btn--secondary" onClick={() => void loadMore()} disabled={!spaceId}>
              Load older activity
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
