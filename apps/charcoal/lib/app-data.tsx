"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchActivity, fetchBoundsFor, fetchCapabilities, fetchJobs, fetchParticipants, fetchRequests, fetchSpace, fetchSpaces,
  type Activity, type Bounds, type Capabilities, type Job, type Participant, type Request, type Space, type SpaceSummary,
} from "@/lib/contract";

interface AppData {
  spaces: SpaceSummary[]; space: Space | null; bounds: Bounds | null; capabilities: Capabilities | null;
  participants: Participant[]; jobs: Job[]; requests: Request[]; activity: Activity[]; nextCursor: number;
  loading: boolean; error: string | null; actorId: string; setActorId: (id: string) => void; spaceId: string;
  refresh: () => Promise<void>; setSpaceId: (id: string) => void;
}
const Context = createContext<AppData | null>(null);
export const useAppData = () => { const value = useContext(Context); if (!value) throw new Error("useAppData outside AppDataProvider"); return value; };

function nextJobsForSelected(entries: Array<{ item: { id: string }; jobs: Job[] }>, selectedId: string): Promise<Job[]> {
  return Promise.resolve(entries.find(({ item }) => item.id === selectedId)?.jobs ?? []);
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [spaceId, setSpaceId] = useState("");
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

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await fetchSpaces();
      setSpaces(list);
      const candidates = list.filter((item) => !spaceId || item.id === spaceId);
      if (!candidates.length) throw new Error("No seeded Space is available on the API.");
      const jobCounts = await Promise.all(candidates.map(async (item) => ({ item, jobs: await fetchJobs(item.id) })));
      const selected = jobCounts.find(({ jobs }) => jobs.length > 0)?.item ?? candidates[0];
      setSpaceId(selected.id);
      const [nextSpace, nextBounds, nextCaps, nextParticipants, nextJobs, nextRequests, nextActivity] = await Promise.all([
        fetchSpace(selected.id), fetchBoundsFor(selected.id, actorId), fetchCapabilities(selected.id, actorId),
        fetchParticipants(selected.id), nextJobsForSelected(jobCounts, selected.id), fetchRequests(selected.id), fetchActivity(selected.id, 50, 0),
      ]);
      setSpace(nextSpace); setBounds(nextBounds); setCapabilities(nextCaps); setParticipants(nextParticipants); setJobs(nextJobs); setRequests(nextRequests); setActivity(nextActivity.activity); setNextCursor(nextActivity.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load the Space."); }
    finally { setLoading(false); }
  }, [actorId, spaceId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ spaces, space, bounds, capabilities, participants, jobs, requests, activity, nextCursor, loading, error, actorId, setActorId, spaceId, refresh, setSpaceId }), [spaces, space, bounds, capabilities, participants, jobs, requests, activity, nextCursor, loading, error, actorId, spaceId, refresh]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
