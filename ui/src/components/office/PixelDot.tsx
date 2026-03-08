import type React from "react";
import { cn } from "@/lib/utils";

type DotAnimation = "ping" | "pulse" | "bounce" | "none";

interface Props {
  color: string;
  animation?: DotAnimation;
  className?: string;
  style?: React.CSSProperties;
}

export function PixelDot({ color, animation = "none", className, style }: Props) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5 rounded-full", className)} style={style}>
      {animation === "ping" && (
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full border",
          animation === "pulse" && "animate-pulse",
          animation === "bounce" && "animate-bounce"
        )}
        style={{
          backgroundColor: color,
          borderColor: `color-mix(in srgb, ${color} 70%, black)`,
        }}
      />
    </span>
  );
}
