"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchActivity, fetchBoundsFor, fetchCapabilities, fetchJobs, fetchParticipants, fetchRequests, fetchSpace, fetchSpaces,
  type Activity, type Bounds, type Capabilities, type Job, type Participant, type Request, type Space, type SpaceSummary,
} from "@/lib/contract";
import { useWalletSession } from "@/lib/wallet-session";

interface AppData {
  spaces: SpaceSummary[]; space: Space | null; bounds: Bounds | null; capabilities: Capabilities | null;
  participants: Participant[]; jobs: Job[]; requests: Request[]; activity: Activity[]; nextCursor: number;
  loading: boolean; error: string | null; actorId: string; setActorId: (id: string) => void; spaceId: string;
  refresh: () => Promise<void>; setSpaceId: (id: string) => void;
}
const Context = createContext<AppData | null>(null);
export const useAppData = () => { const value = useContext(Context); if (!value) throw new Error("useAppData outside AppDataProvider"); return value; };

/** How many Spaces to probe when auto-selecting one that has work. */
const AUTO_SELECT_PROBE = 8;

function nextJobsForSelected(entries: Array<{ item: { id: string }; jobs: Job[] }>, selectedId: string): Promise<Job[]> {
  return Promise.resolve(entries.find(({ item }) => item.id === selectedId)?.jobs ?? []);
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [spaceId, setSpaceIdRaw] = useState("");
  /* Whether the operator has touched the Space selector.
     refresh() picks the first Space that has jobs, which is a convenience for
     someone arriving at a populated app. It also meant that clearing the
     selector did nothing: the next refresh re-picked a Space, so "I am not in a
     Space" could never be reached and the entry gate could never appear. An
     explicit choice, including an explicit empty one, is now respected. */
  const [spaceChosen, setSpaceChosen] = useState(false);
  // Two setters, because they mean different things. The public one records that
  // a person chose; the internal one is what refresh() uses when it picks a
  // Space on someone's behalf. Routing both through setSpaceChosen meant the
  // automatic pick marked itself as an explicit choice, so the next refresh with
  // nothing to show treated the app as deliberately deselected.
  const setSpaceId = useCallback((id: string) => {
    setSpaceChosen(true);
    setSpaceIdRaw(id);
  }, []);
  const autoSelectSpaceId = useCallback((id: string) => setSpaceIdRaw(id), []);
  const [space, setSpace] = useState<Space | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState(0);
  const [actorId, setActorId] = useState("admin-01");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { address, isAuthenticated } = useWalletSession();

  useEffect(() => {
    if (isAuthenticated && address) setActorId(address);
  }, [address, isAuthenticated]);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await fetchSpaces(isAuthenticated ? address || actorId : undefined);
      setSpaces(list);
      if (!list.length) {
        autoSelectSpaceId("");
        setSpace(null); setBounds(null); setCapabilities(null); setParticipants([]); setJobs([]); setRequests([]); setActivity([]); setNextCursor(0);
        return;
      }
      // An explicit selection, including "none", wins over the convenience pick.
      if (spaceChosen && !spaceId) {
        setSpace(null); setBounds(null); setCapabilities(null); setParticipants([]); setJobs([]); setRequests([]); setActivity([]); setNextCursor(0);
        return;
      }
      const candidates = list.filter((item) => !spaceId || item.id === spaceId);
      if (!candidates.length) throw new Error("The selected Space is no longer available.");
      // Pick a Space that has work, but do not fetch jobs for every Space to do
      // it. This ran one request per Space on every page load, and because the
      // e2e suite creates a Space per test and never deletes one, the list grew
      // until a single page load fired 119 parallel requests. Probe a bounded
      // prefix instead and fall back to the first candidate.
      const probe = candidates.slice(0, AUTO_SELECT_PROBE);
      const jobCounts = await Promise.all(probe.map(async (item) => ({ item, jobs: await fetchJobs(item.id) })));
      const selected = jobCounts.find(({ jobs }) => jobs.length > 0)?.item ?? candidates[0];
      autoSelectSpaceId(selected.id);
      const [nextSpace, nextBounds, nextCaps, nextParticipants, nextJobs, nextRequests, nextActivity] = await Promise.all([
        fetchSpace(selected.id), fetchBoundsFor(selected.id, actorId), fetchCapabilities(selected.id, actorId),
        fetchParticipants(selected.id), nextJobsForSelected(jobCounts, selected.id), fetchRequests(selected.id), fetchActivity(selected.id, 50, 0),
      ]);
      setSpace(nextSpace); setBounds(nextBounds); setCapabilities(nextCaps); setParticipants(nextParticipants); setJobs(nextJobs); setRequests(nextRequests); setActivity(nextActivity.activity); setNextCursor(nextActivity.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the Space."); }
    finally { setLoading(false); }
  }, [actorId, spaceId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ spaces, space, bounds, capabilities, participants, jobs, requests, activity, nextCursor, loading, error, actorId, setActorId, spaceId, refresh, setSpaceId }), [spaces, space, bounds, capabilities, participants, jobs, requests, activity, nextCursor, loading, error, actorId, spaceId, refresh, setSpaceId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
