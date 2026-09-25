"use client";

import { useEffect, useRef, useState } from "react";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { SectionIntro } from "@/components/app/SectionIntro";
import { API_BASE, fetchActivity, type Activity } from "@/lib/contract";
import { useAppData } from "@/lib/app-data";

const EVENT_TYPES = ["SPACE_CREATED", "SPACE_FUNDED", "PARTICIPANT_ADDED", "PARTICIPANT_REMOVED", "REQUEST_CREATED", "REQUEST_ACCEPTED", "REQUEST_COMPLETED", "REQUEST_BLOCKED", "REQUEST_CANCELLED", "WORK_CREATED", "WORK_DENIED", "WORK_SUBMITTED", "WORK_COMPLETED", "WORK_REJECTED", "WORK_EXPIRED", "WORK_ADJUDICATION_REQUESTED", "WORK_ADJUDICATION_RESOLVED", "PAYMENT_SETTLED", "PAYMENT_DENIED"];
const typeLabel = (type: string) => type.replaceAll("_", " ");
const isDenial = (type: string) => type.includes("DENIED");
const isSettle = (type: string) => type.includes("SETTLED") || type.includes("COMPLETED");

type StreamEnvelope = { seq?: number; type?: string; payload?: Record<string, unknown> };

export function AuditStream({ embedded = false }: { embedded?: boolean } = {}) {
  const { spaceId, activity, nextCursor, refresh } = useAppData();
  const [items, setItems] = useState<Activity[]>(activity);
  const [cursor, setCursor] = useState(nextCursor);
  const [streamState, setStreamState] = useState(spaceId ? "connecting" : "waiting");
  const [flash, setFlash] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  useEffect(() => { setItems(activity); setCursor(nextCursor); }, [activity, nextCursor]);
  useEffect(() => {
    if (!spaceId) {
      setStreamState("waiting");
      return;
    }
    const source = new EventSource(`${API_BASE}/api/spaces/${encodeURIComponent(spaceId)}/events?since=${nextCursor}`);
    esRef.current = source;
    source.onopen = () => setStreamState("live");
    source.onerror = () => setStreamState("reconnecting");
    const onEvent = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as StreamEnvelope;
        const payload = parsed.payload && typeof parsed.payload === "object" ? { ...parsed.payload, seq: parsed.seq ?? 0, type: parsed.type ?? "UNKNOWN" } : parsed as unknown as Activity;
        setItems((current) => current.some((item) => item.seq === payload.seq && item.type === payload.type) ? current : [payload, ...current].slice(0, 100));
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
    return () => { source.close(); esRef.current = null; };
  }, [spaceId, nextCursor]);
  const loadMore = async () => {
    setPageError(null);
    try {
      const next = await fetchActivity(spaceId, 50, cursor);
      setItems((current) => [...next.activity, ...current.filter((item) => !next.activity.some((entry) => entry.seq === item.seq))]);
      setCursor(next.nextCursor);
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "Unable to load older activity.");
    }
  };
  return <section className={`app-section app-section--audit ${embedded ? "app-section--embedded" : ""}`} id="audit"><div className="container">{!embedded && <SectionIntro eyebrow="AUDIT STREAM" segments={[{ text: "Every event, in" }, { text: "sequence", accent: true }, { text: "." }]} copy="Activity is paginated from the Space cursor and appended live over SSE. Settlements and denials flash with the reason they exist: proof or policy." />}{flash && <div className={`audit-flash ${isDenial(flash.split(" ")[0]) ? "audit-flash--danger" : ""}`}>{flash}</div>}{pageError && <div className="audit-flash audit-flash--danger">{pageError}</div>}<CardRise className="audit-panel"><div className="audit-toolbar"><div><span className="eyebrow">LIVE ACTIVITY</span><span className="muted" style={{ marginLeft: 12, fontSize: 11 }}>{items.length} loaded</span></div><StatusPill label={streamState === "live" ? "SSE LIVE" : streamState.toUpperCase()} tone={streamState === "live" ? "active" : "quiet"} /></div><div className="audit-list">{items.length === 0 && <div className="audit-empty">No activity yet. The stream will append the first event here.</div>}{items.map((item) => <div className={`audit-row ${isDenial(item.type) ? "audit-row--denial" : isSettle(item.type) ? "audit-row--settle" : ""}`} key={`${item.seq}-${item.type}`}><span className="font-ui audit-seq">{String(item.seq).padStart(3, "0")}</span><span className="font-ui audit-type">{typeLabel(item.type)}</span><span className="muted audit-detail">{typeof item.title === "string" ? item.title : typeof item.jobId === "string" ? item.jobId : typeof item.requestId === "string" ? item.requestId : typeof item.amount === "string" ? item.amount : "—"}</span>{typeof item.proofHash === "string" && <HashChip hash={item.proofHash} label="proof" kind="proof" />}</div>)}</div><div className="audit-footer"><span className="muted" style={{ fontSize: 11 }}>Cursor {cursor} · {streamState === "live" ? "updates continue over SSE" : "stream will retry"}</span><button onClick={() => void loadMore()} disabled={!spaceId}>Load older activity</button></div></CardRise></div></section>;

}
