import type React from "react";
import { cn } from "@/lib/utils";
import { InlineMarkdown } from "./InlineMarkdown";

interface Props {
  text: string;
  variant?: "default" | "error";
  onClick?: (e: React.MouseEvent) => void;
}

export function SpeechBubble({ text, variant = "default", onClick }: Props) {
  const isError = variant === "error";

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 transition-opacity w-max"
      style={{ bottom: "120%", fontSize: "0.9cqi", maxWidth: "20cqi" }}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative px-2 py-1 text-center border shadow-md",
          isError
            ? "bg-red-50 text-red-700 border-red-200 line-clamp-3"
            : "bg-white text-black border-black/10 line-clamp-2 hover:bg-gray-50 transition-colors cursor-pointer"
        )}
        style={{ borderRadius: 12 }}
      >
        <InlineMarkdown>{text}</InlineMarkdown>
        <div
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 border-r border-b rotate-45",
            isError ? "bg-red-50 border-red-200" : "bg-white border-black/10"
          )}
        />
      </div>
    </div>
  );
}
