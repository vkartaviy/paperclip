import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useNavigate } from "@/lib/router";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { officeApi } from "@/api/office";
import { activityApi } from "@/api/activity";
import { heartbeatsApi } from "@/api/heartbeats";
import { queryKeys } from "@/lib/queryKeys";
import { TileMapCanvas } from "@/components/office/TileMapCanvas";
import { AgentOverlay } from "@/components/office/AgentOverlay";
import { VacantSeatOverlay } from "@/components/office/VacantSeatOverlay";
import { RadioPlayer } from "@/components/office/RadioPlayer";
import type { ActivityEvent, Agent, Issue } from "@paperclipai/shared";
import type { TiledMap, TiledObject } from "@/components/office/types";
import { officeAudio } from "@/lib/office-audio";
import "@/components/office/office-fonts.css";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function describeActivity(
  evt: ActivityEvent,
  issues?: Issue[],
): { text: string; href: string | null } {
  const d = evt.details ?? {};
  const cachedIssue = evt.entityType === "issue" ? issues?.find((i) => i.id === evt.entityId) : undefined;
  const ref =
    str(d.identifier) ??
    str(d.issueIdentifier) ??
    cachedIssue?.identifier ??
    null;
  const title = str(d.issueTitle) ?? str(d.title) ?? cachedIssue?.title ?? null;
  const href = ref ? `/issues/${ref}` : null;

  const detail = title ? `: ${title}` : "";

  switch (evt.action) {
    case "issue.created":
      return { text: ref ? `Created ${ref}${detail}` : "Created issue", href };

    case "issue.comment_added": {
      const snippet = str(d.bodySnippet);
      const cleanSnippet = snippet?.replace(/^#+\s*/m, "").replace(/\n/g, " ");
      const commentId = str(d.commentId);
      const commentHref = href && commentId ? `${href}#comment-${commentId}` : href;

      return {
        text: ref ? `Commented on ${ref}${cleanSnippet ? `: ${cleanSnippet}` : ""}` : "Added comment",
        href: commentHref,
      };
    }
    case "issue.updated": {
      const status = str(d.status);
      const priority = str(d.priority);
      const newTitle = str(d.title);

      if (status && ref) {
        return { text: `Updated ${ref} (status → ${status.replace(/_/g, " ")})${detail}`, href };
      }
      if (priority && ref) {
        return { text: `Updated ${ref} (priority → ${priority})${detail}`, href };
      }
      if (newTitle && ref) {
        return { text: `Renamed ${ref}: ${newTitle}`, href };
      }
      if ("assigneeAgentId" in d && ref) {
        return { text: `Reassigned ${ref}${detail}`, href };
      }

      return { text: ref ? `Updated ${ref}${detail}` : "Updated issue", href };
    }

    case "issue.checked_out":
      return { text: ref ? `Checked out ${ref}${detail}` : "Checked out issue", href };

    case "issue.released":
      return { text: ref ? `Finished ${ref}${detail}` : "Released issue", href };

    default:
      return { text: evt.action.replace(/^[a-z]+\./, "").replace(/_/g, " "), href: null };
  }
}

// System activity actions that don't carry user-visible meaning
const muteActions = new Set(["heartbeat.invoked", "heartbeat.callback"]);

function findObjects(mapData: TiledMap, type: string): TiledObject[] {
  const result: TiledObject[] = [];

  for (const layer of mapData.layers) {
    if (layer.type !== "objectgroup" || !layer.objects) {
      continue;
    }
    for (const obj of layer.objects) {
      if (obj.type === type) {
        result.push(obj);
      }
    }
  }

  return result;
}

export function Office() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Office" }]);
  }, [setBreadcrumbs]);

  const { data: office, isLoading: officeLoading } = useQuery({
    queryKey: queryKeys.office(selectedCompanyId!),
    queryFn: () => officeApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  // Live runs for speech bubbles (current work)
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  // Latest activity (needed early for current work deep-links + tooltip)
  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const currentWorkByAgent = useMemo(() => {
    if (!liveRuns || !selectedCompanyId) {
      return new Map<string, { text: string; href: string }>();
    }

    // Build a lookup: agentId → in_progress issue (most relevant current work)
    const inProgressByAgent = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      if (issue.status === "in_progress" && issue.assigneeAgentId) {
        inProgressByAgent.set(issue.assigneeAgentId, issue);
      }
    }

    // Build a lookup: agentId+issueId → latest commentId from activity
    const latestCommentByAgentIssue = new Map<string, string>();
    for (const evt of activity ?? []) {
      if (evt.action === "issue.comment_added" && evt.agentId && evt.entityType === "issue") {
        const key = `${evt.agentId}:${evt.entityId}`;
        if (!latestCommentByAgentIssue.has(key)) {
          const commentId = str(evt.details?.commentId);
          if (commentId) latestCommentByAgentIssue.set(key, commentId);
        }
      }
    }

    const map = new Map<string, { text: string; href: string }>();

    for (const run of liveRuns) {
      if (map.has(run.agentId)) {
        continue;
      }

      // Prefer in_progress issue assigned to this agent over contextSnapshot
      const issue = inProgressByAgent.get(run.agentId)
        ?? (run.issueId ? issueById.get(run.issueId) : undefined);

      if (!issue) {
        continue;
      }

      const baseHref = `/issues/${issue.identifier}`;
      const commentId = latestCommentByAgentIssue.get(`${run.agentId}:${issue.id}`);

      map.set(run.agentId, {
        text: `${issue.identifier}${issue.title ? `: ${issue.title}` : ""}`,
        href: commentId ? `${baseHref}#comment-${commentId}` : baseHref,
      });
    }

    return map;
  }, [liveRuns, selectedCompanyId, issues, issueById, activity]);

  // Recent runs for error bubbles (HeartbeatRun has error/errorCode fields)
  const hasErrorAgents = agents?.some((a) => a.status === "error") ?? false;

  const { data: recentRuns } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && hasErrorAgents,
    refetchInterval: 60_000,
  });

  const lastFailedRunByAgent = useMemo(() => {
    const map = new Map<string, { text: string; href: string }>();

    if (!recentRuns) {
      return map;
    }

    for (const run of recentRuns) {
      if (map.has(run.agentId)) {
        continue;
      }

      const isFailed = run.status === "failed" || run.status === "timed_out";

      if (!isFailed) {
        continue;
      }

      const errorMsg = run.error ?? run.errorCode?.replace(/_/g, " ") ?? "Run failed";

      map.set(run.agentId, {
        text: errorMsg,
        href: `/agents/${run.agentId}/runs/${run.id}`,
      });
    }

    return map;
  }, [recentRuns]);

  // Latest activity per agent (for tooltip)
  const latestActivityByAgent = useMemo(() => {
    if (!activity) {
      return new Map<string, { text: string; href: string | null; at: Date }>();
    }

    const map = new Map<string, { text: string; href: string | null; at: Date }>();

    for (const evt of activity) {
      if (evt.agentId && !map.has(evt.agentId) && !muteActions.has(evt.action)) {
        const { text, href } = describeActivity(evt, issues);
        map.set(evt.agentId, { text, href, at: new Date(evt.createdAt) });
      }
    }

    return map;
  }, [activity, issues]);

  // Temporary activity speech bubbles — appear when new events arrive via WS
  const seenActivityRef = useRef<Set<string> | null>(null);
  const [activityBubbles, setActivityBubbles] = useState(
    () => new Map<string, { text: string; expiresAt: number }>()
  );

  useEffect(() => {
    if (!activity) {
      return;
    }

    // First load: seed seen set without showing bubbles
    if (!seenActivityRef.current) {
      seenActivityRef.current = new Set(activity.map((e) => e.id));
      return;
    }

    const seen = seenActivityRef.current;
    const now = Date.now();
    let hasNew = false;

    for (const evt of activity) {
      if (seen.has(evt.id) || !evt.agentId) {
        continue;
      }

      seen.add(evt.id);

      if (muteActions.has(evt.action)) {
        continue;
      }

      hasNew = true;

      setActivityBubbles((prev) => {
        const next = new Map(prev);
        next.set(evt.agentId!, { text: describeActivity(evt, issues).text, expiresAt: now + 6000 });
        return next;
      });
    }

    // Cap seen set size to avoid unbounded growth
    if (hasNew && seen.size > 500) {
      const ids = activity.map((e) => e.id);
      seenActivityRef.current = new Set(ids);
    }
  }, [activity, issues]);

  // Cleanup expired bubbles
  useEffect(() => {
    if (activityBubbles.size === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActivityBubbles((prev) => {
        const now = Date.now();
        const next = new Map<string, { text: string; expiresAt: number }>();
        for (const [id, b] of prev) {
          if (b.expiresAt > now) {
            next.set(id, b);
          }
        }
        return next;
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [activityBubbles]);

  const mapData = office?.mapData;

  // Extract seat positions and record player from map data
  // Visual offset: seats in the Tiled map mark the chair tile, but agents render
  // one tile lower so they appear seated at the desk. Adjust here once — all
  // downstream consumers (canvas sprites, HTML overlays) use the corrected y.
  const seatRenderOffset = mapData?.tileheight ?? 32;

  const seatPositions = useMemo(() => {
    if (!mapData) {
      return new Map<string, { x: number; y: number }>();
    }

    const map = new Map<string, { x: number; y: number }>();

    for (const obj of findObjects(mapData, "seat")) {
      map.set(obj.name, { x: obj.x, y: obj.y + seatRenderOffset });
    }

    return map;
  }, [mapData]);

  const recordPlayer = useMemo(() => {
    if (!mapData) {
      return null;
    }

    return findObjects(mapData, "record_player")[0] ?? null;
  }, [mapData]);

  // Derive all seat-related data in a single pass
  const seats = office?.seats;
  const { agentSprites, agentOverlays, vacantSeats, unseatedAgents } = useMemo(() => {
    const sprites: Array<{
      seatId: string;
      x: number;
      y: number;
      sprite: string;
      statusColor: string;
      isRunning: boolean;
    }> = [];
    const overlays: Array<{
      agent: Agent;
      seatId: string;
      seat: { x: number; y: number };
      charSprite: string;
      currentWork: { text: string; href: string } | null;
      activityBubble: string | null;
      lastAction: { text: string; href: string | null; at: Date } | null;
      errorText: string | null;
    }> = [];

    const occupiedIds = new Set<string>();
    const seatedIds = new Set<string>();

    for (const seat of seats ?? []) {
      occupiedIds.add(seat.seatId);
      seatedIds.add(seat.agentId);

      const agent = agents?.find((a) => a.id === seat.agentId);
      const pos = seatPositions.get(seat.seatId);

      if (!pos) {
        continue;
      }

      sprites.push({
        seatId: seat.seatId,
        x: pos.x,
        y: pos.y,
        sprite: seat.charSprite,
        statusColor: "",
        isRunning: agent?.status === "running",
      });

      if (agent) {
        overlays.push({
          agent,
          seatId: seat.seatId,
          seat: pos,
          charSprite: seat.charSprite,
          currentWork: currentWorkByAgent.get(agent.id) ?? null,
          activityBubble: activityBubbles.get(agent.id)?.text ?? null,
          lastAction: latestActivityByAgent.get(agent.id) ?? null,
          errorText:
            agent.status === "error" ? (lastFailedRunByAgent.get(agent.id)?.text ?? "Error") : null,
        });
      }
    }

    const vacant: Array<{ seatId: string; x: number; y: number }> = [];

    for (const [seatId, pos] of seatPositions) {
      if (!occupiedIds.has(seatId)) {
        vacant.push({ seatId, ...pos });
      }
    }

    const unseated = (agents ?? []).filter(
      (a) => !seatedIds.has(a.id) && a.status !== "terminated"
    );

    return {
      agentSprites: sprites,
      agentOverlays: overlays,
      vacantSeats: vacant,
      unseatedAgents: unseated,
    };
  }, [
    seats,
    agents,
    seatPositions,
    currentWorkByAgent,
    activityBubbles,
    lastFailedRunByAgent,
    latestActivityByAgent,
  ]);

  const invalidateOffice = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.office(selectedCompanyId!) }),
    [selectedCompanyId, queryClient]
  );

  const handleAssignSeat = useCallback(
    async (agentId: string, seatId: string, charSprite: string) => {
      if (!selectedCompanyId) {
        return;
      }

      await officeApi.assignSeat(selectedCompanyId, agentId, { seatId, charSprite });
      await invalidateOffice();
    },
    [selectedCompanyId, invalidateOffice]
  );

  const handleChangeSprite = useCallback(
    async (agentId: string, seatId: string, charSprite: string) => {
      if (!selectedCompanyId) {
        return;
      }

      await officeApi.assignSeat(selectedCompanyId, agentId, { seatId, charSprite });
      await invalidateOffice();
    },
    [selectedCompanyId, invalidateOffice]
  );

  const handleUnseatAgent = useCallback(
    async (agentId: string) => {
      if (!selectedCompanyId) {
        return;
      }

      await officeApi.unassignSeat(selectedCompanyId, agentId);
      await invalidateOffice();
    },
    [selectedCompanyId, invalidateOffice]
  );

  const tileSize = mapData?.tilewidth ?? 32;
  const mapW = (mapData?.width ?? 21) * tileSize;
  const mapH = (mapData?.height ?? 17) * tileSize;

  const audioState = useSyncExternalStore(
    (cb) => officeAudio.subscribe(cb),
    () => officeAudio.getState()
  );

  if (officeLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading office...
      </div>
    );
  }

  if (!office || !mapData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-sm text-muted-foreground">No office set up yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative w-full" style={{ containerType: "inline-size" }}>
        <TileMapCanvas
          mapData={mapData}
          agents={agentSprites}
          recordPlayer={recordPlayer}
          playing={audioState.playing}
        />

        {/* Agent HTML overlays — percentage-based positioning */}
        <div className="absolute inset-0 pointer-events-none">
          <AgentOverlay
            agents={agentOverlays}
            mapWidth={mapW}
            mapHeight={mapH}
            tileSize={tileSize}
            onAgentClick={(agentId) => navigate(`/agents/${agentId}`)}
            onChangeSprite={handleChangeSprite}
            onUnseat={handleUnseatAgent}
          />
          <VacantSeatOverlay
            seats={vacantSeats}
            agents={unseatedAgents}
            mapWidth={mapW}
            mapHeight={mapH}
            tileSize={tileSize}
            onAssign={handleAssignSeat}
          />
        </div>

        {/* Record player */}
        {recordPlayer && (
          <RadioPlayer
            mapWidth={mapW}
            mapHeight={mapH}
            x={recordPlayer.x}
            y={recordPlayer.y}
            width={recordPlayer.width}
            height={recordPlayer.height}
          />
        )}
      </div>
    </div>
  );
}
