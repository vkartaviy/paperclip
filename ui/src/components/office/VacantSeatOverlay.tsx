import { useState } from "react";
import type { Agent } from "@paperclipai/shared";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { SpritePicker } from "./SpritePicker";

interface SeatPosition {
  seatId: string;
  x: number;
  y: number;
}

interface Props {
  seats: SeatPosition[];
  agents: Agent[];
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  onAssign: (agentId: string, seatId: string, charSprite: string) => void;
}

export function VacantSeatOverlay({
  seats,
  agents,
  mapWidth,
  mapHeight,
  tileSize,
  onAssign,
}: Props) {
  const [openSeatId, setOpenSeatId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  function reset() {
    setOpenSeatId(null);
    setSelectedAgent(null);
  }

  return (
    <>
      {seats.map((seat) => (
        <Popover
          key={seat.seatId}
          open={openSeatId === seat.seatId}
          onOpenChange={(open) => {
            if (open) {
              setOpenSeatId(seat.seatId);
              setSelectedAgent(null);
            } else {
              reset();
            }
          }}
        >
          <PopoverTrigger asChild>
            <div
              className="absolute cursor-pointer pointer-events-auto opacity-0 hover:opacity-100 transition-opacity"
              style={{
                left: `${(seat.x / mapWidth) * 100}%`,
                top: `${((seat.y - tileSize) / mapHeight) * 100}%`,
                width: `${(tileSize / mapWidth) * 100}%`,
                height: `${(tileSize / mapHeight) * 100}%`,
              }}
            >
              <div className="w-full h-full rounded border-2 border-dashed border-green-400/70 bg-green-400/20" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-1" side="right" align="start">
            {!selectedAgent ? (
              <>
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Assign agent
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                      onClick={() => setSelectedAgent(agent)}
                    >
                      <div className="font-medium">{agent.name}</div>
                      {agent.title && (
                        <div className="text-xs text-muted-foreground">{agent.title}</div>
                      )}
                    </button>
                  ))}
                  {agents.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No available agents
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Choose character for {selectedAgent.name}
                </div>
                <SpritePicker
                  onSelect={(charSprite) => {
                    onAssign(selectedAgent.id, seat.seatId, charSprite);
                    reset();
                  }}
                />
                <button
                  className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSelectedAgent(null)}
                >
                  &larr; Back
                </button>
              </>
            )}
          </PopoverContent>
        </Popover>
      ))}
    </>
  );
}
