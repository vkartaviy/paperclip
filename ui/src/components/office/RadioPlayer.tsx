import { useSyncExternalStore } from "react";
import { officeAudio } from "@/lib/office-audio";
import { PixelDot } from "./PixelDot";

interface Props {
  mapWidth: number;
  mapHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function RadioPlayer({ mapWidth, mapHeight, x, y, width, height }: Props) {
  const state = useSyncExternalStore(
    (cb) => officeAudio.subscribe(cb),
    () => officeAudio.getState()
  );

  return (
    <div
      className="absolute cursor-pointer select-none"
      style={{
        left: `${(x / mapWidth) * 100}%`,
        top: `${(y / mapHeight) * 100}%`,
        width: `${(width / mapWidth) * 100}%`,
        height: `${(height / mapHeight) * 100}%`,
      }}
      onClick={() => officeAudio.playOrNext()}
      onContextMenu={(e) => {
        e.preventDefault();
        officeAudio.stop();
      }}
    >
      <PixelDot
        color={state.playing ? "#22c55e" : "#ef4444"}
        animation={state.playing ? "pulse" : "none"}
        className="absolute right-0 top-2"
      />

      {/* Station label */}
      {state.playing && state.station && (
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center text-amber-400"
          style={{
            bottom: "-20%",
            fontSize: "1cqi",
            fontFamily: '"Press Start 2P", monospace',
            WebkitTextStroke: "4px #000",
            paintOrder: "stroke fill",
          }}
        >
          {state.station.name}
        </div>
      )}
    </div>
  );
}
