import { useState } from "react";
import type { Agent } from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { PixelDot } from "./PixelDot";
import { SpeechBubble } from "./SpeechBubble";
import { AgentTooltip } from "./AgentTooltip";
import { agentDotColor, agentDotColorDefault } from "./agent-colors";

interface CurrentWork {
  text: string;
  href: string;
}

interface LastAction {
  text: string;
  at: Date;
}

interface SeatPosition {
  x: number;
  y: number;
}

interface Props {
  agents: Array<{
    agent: Agent;
    seatId: string;
    seat: SeatPosition;
    charSprite: string;
    currentWork: CurrentWork | null;
    activityBubble: string | null;
    lastAction: LastAction | null;
    errorText: string | null;
  }>;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  onAgentClick?: (agentId: string) => void;
  onChangeSprite?: (agentId: string, seatId: string, charSprite: string) => void;
  onUnseat?: (agentId: string) => void;
}

export function AgentOverlay({
  agents,
  mapWidth,
  mapHeight,
  tileSize,
  onAgentClick,
  onChangeSprite,
  onUnseat,
}: Props) {
  const navigate = useNavigate();
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  return (
    <>
      {agents.map(({ agent, seatId, seat, charSprite, currentWork, activityBubble, lastAction, errorText }) => {
        const isError = agent.status === "error";
        const isRunning = agent.status === "running";
        const isEditing = editingAgentId === agent.id;

        return (
          <div
            key={agent.id}
            className="absolute pointer-events-auto group cursor-pointer"
            style={{
              left: `${(seat.x / mapWidth) * 100}%`,
              top: `${((seat.y - tileSize) / mapHeight) * 100}%`,
              width: `${(tileSize / mapWidth) * 100}%`,
              height: `${((tileSize * 2) / mapHeight) * 100}%`,
            }}
            onClick={() => {
              if (isEditing) {
                setEditingAgentId(null);
              } else {
                onAgentClick?.(agent.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setEditingAgentId(isEditing ? null : agent.id);
            }}
          >
            {/* Speech bubble — priority: error > activity > current work */}
            {isError && <SpeechBubble text={errorText ?? "Error"} variant="error" />}

            {!isError && activityBubble && <SpeechBubble text={activityBubble} />}

            {!isError && !activityBubble && isRunning && currentWork && (
              <SpeechBubble
                text={currentWork.text}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(currentWork.href);
                }}
              />
            )}

            {/* Status dot */}
            <PixelDot
              color={agentDotColor[agent.status] ?? agentDotColorDefault}
              animation={isRunning ? "ping" : isError ? "bounce" : "none"}
              className="absolute"
              style={{ right: "0%", top: "0%" }}
            />

            {/* Name label */}
            <div
              className="absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap"
              style={{ bottom: "2%", fontSize: "1cqi", lineHeight: 1 }}
            >
              <span
                className="text-white"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  WebkitTextStroke: "4px #000",
                  paintOrder: "stroke fill",
                }}
              >
                {agent.name}
              </span>
            </div>

            {/* Tooltip on hover / edit panel on right-click */}
            <AgentTooltip
              agent={agent}
              seatId={seatId}
              charSprite={charSprite}
              lastAction={lastAction}
              editing={isEditing}
              onChangeSprite={(agentId, sid, sprite) => {
                onChangeSprite?.(agentId, sid, sprite);
                setEditingAgentId(null);
              }}
              onUnseat={(agentId) => {
                onUnseat?.(agentId);
                setEditingAgentId(null);
              }}
              onClose={() => setEditingAgentId(null)}
            />
          </div>
        );
      })}
    </>
  );
}
