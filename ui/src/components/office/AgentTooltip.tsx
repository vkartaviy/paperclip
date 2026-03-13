import type { Agent } from "@paperclipai/shared";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/lib/router";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { timeAgo } from "@/lib/timeAgo";
import { getUIAdapter } from "@/adapters/registry";
import { roleLabels } from "@/components/agent-config-primitives";
import { InlineMarkdown } from "./InlineMarkdown";
import { SpritePicker } from "./SpritePicker";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatBudget(spent: number, budget: number): string {
  if (budget === 0) {
    return formatCents(spent);
  }

  return `${formatCents(spent)} / ${formatCents(budget)}`;
}

const statusTextColor: Record<string, string> = {
  running: "text-blue-600 dark:text-blue-400",
  error: "text-red-600 dark:text-red-400",
  active: "text-green-600 dark:text-green-400",
  paused: "text-orange-600 dark:text-orange-400",
  pending_approval: "text-amber-600 dark:text-amber-400",
};

const statusLabel: Record<string, string> = {
  running: "working",
  error: "error",
  pending_approval: "pending approval",
};

interface LastAction {
  text: string;
  href: string | null;
  at: Date;
}

interface CurrentWork {
  text: string;
  href: string;
}

interface Props {
  agent: Agent;
  seatId: string;
  charSprite: string;
  currentWork: CurrentWork | null;
  lastAction: LastAction | null;
  editing: boolean;
  onChangeSprite?: (agentId: string, seatId: string, charSprite: string) => void;
  onUnseat?: (agentId: string) => void;
  onClose?: () => void;
}

export function AgentTooltip({
  agent,
  seatId,
  charSprite,
  currentWork,
  lastAction,
  editing,
  onChangeSprite,
  onUnseat,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const isRunning = agent.status === "running";
  const adapterLabel = getUIAdapter(agent.adapterType).label;
  const cfg = agent.adapterConfig as Record<string, unknown>;
  const model = cfg?.model as string | undefined;
  const reasoning = (cfg?.modelReasoningEffort ?? cfg?.reasoningEffort) as string | undefined;

  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 bottom-full pb-3 z-50 cursor-default",
        editing ? "block" : "hidden group-hover:block"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-popover border border-border rounded-2xl px-3.5 py-3 shadow-lg min-w-72 max-w-72 overflow-hidden">
        {editing ? (
          <>
            <div className="text-xs font-medium text-muted-foreground mb-1">Change character</div>
            <SpritePicker
              selected={charSprite}
              onSelect={(sprite) => onChangeSprite?.(agent.id, seatId, sprite)}
            />
            <div className="border-t border-border mt-2 pt-2 flex items-center justify-between">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onClose?.()}
              >
                Cancel
              </button>
              <button
                className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                onClick={() => onUnseat?.(agent.id)}
              >
                Remove from office
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header: name + status */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">{agent.name}</span>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  {isRunning && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  )}
                  <span
                    className={cn(
                      "relative inline-flex h-2 w-2 rounded-full",
                      !isRunning && (agentStatusDot[agent.status] ?? agentStatusDotDefault)
                    )}
                    style={isRunning ? { backgroundColor: "#3b82f6" } : undefined}
                  />
                </span>
                <span
                  className={cn(
                    "text-xs capitalize font-medium",
                    statusTextColor[agent.status] ?? "text-muted-foreground"
                  )}
                >
                  {statusLabel[agent.status] ?? agent.status.replace("_", " ")}
                </span>
              </div>
            </div>

            {agent.title && (
              <div className="text-xs text-muted-foreground mt-0.5">{agent.title}</div>
            )}

            {/* Stats grid */}
            <div className="border-t border-border mt-2.5 pt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {agent.role && (
                <>
                  <div className="text-muted-foreground">Role</div>
                  <div className="text-foreground text-right">
                    {roleLabels[agent.role] ?? agent.role}
                  </div>
                </>
              )}

              <div className="text-muted-foreground">Provider</div>
              <div className="text-foreground text-right">{adapterLabel}</div>

              {model && (
                <>
                  <div className="text-muted-foreground">Model</div>
                  <div className="text-foreground text-right">
                    {model}
                    {reasoning && <span className="text-muted-foreground"> ({reasoning})</span>}
                  </div>
                </>
              )}

              <div className="text-muted-foreground">Spent</div>
              <div className="text-foreground text-right font-medium">
                {formatBudget(agent.spentMonthlyCents, agent.budgetMonthlyCents)}
              </div>
            </div>

            {/* Current work */}
            {currentWork && (
              <div className="border-t border-border mt-2.5 pt-2">
                <a
                  className="block text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer line-clamp-2"
                  onClick={(e) => { e.stopPropagation(); navigate(currentWork.href); }}
                >
                  <InlineMarkdown>{currentWork.text}</InlineMarkdown>
                </a>
              </div>
            )}

            {/* Last action (hide if same issue as current work) */}
            {lastAction && !(currentWork && lastAction.href && currentWork.href.split("#")[0] === lastAction.href.split("#")[0]) && (
              <div className="border-t border-border mt-2.5 pt-2">
                <div className="text-xs text-muted-foreground">
                  <div className="line-clamp-2">
                    {lastAction.href ? (
                      <a
                        className="hover:text-foreground transition-colors cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); navigate(lastAction.href!); }}
                      >
                        <InlineMarkdown>{lastAction.text}</InlineMarkdown>
                      </a>
                    ) : (
                      <InlineMarkdown>{lastAction.text}</InlineMarkdown>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {timeAgo(lastAction.at)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-1.5">
        <div className="w-3 h-3 bg-popover border-r border-b border-border rotate-45" />
      </div>
    </div>
  );
}
