import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface Props {
  children: string;
  className?: string;
}

/** Lightweight markdown renderer for compact contexts (tooltips, bubbles). */
export function InlineMarkdown({ children, className }: Props) {
  return (
    <span
      className={cn(
        "[&_a]:underline [&_code]:text-[0.9em] [&_code]:bg-black/5 [&_code]:px-1 [&_code]:rounded",
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children: c }) => <span>{c}</span>,
          a: ({ href, children: c }) => (
            <a href={href ?? "#"} className="underline" target="_blank" rel="noreferrer">
              {c}
            </a>
          ),
        }}
      >
        {children}
      </Markdown>
    </span>
  );
}
