import { useState, useEffect, useRef } from "react";
import { useStream } from "@langchain/react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import { ScrollButton } from "@/components/ui/scroll-button";
import {
  Message,
  MessageContent,
} from "@/components/ui/message";
import { Tool, ToolGroup } from "@/components/ui/tool";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ui/reasoning";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/ui/prompt-input";
import { Textarea } from "@/components/ui/textarea";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { ModelSelector, type Model } from "@/components/ui/model-selector";
import {
  PanelRightOpenIcon,
  PanelRightCloseIcon,
  PlusIcon,
  ArrowUpIcon,
  SquareIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  PencilIcon,
  ShieldCheckIcon,
  HistoryIcon,
  PlayIcon,
  WifiOffIcon,
  PlugIcon,
  XIcon,
  SparklesIcon,
  CloudIcon,
  SearchIcon,
  SmileIcon,
  AlertCircleIcon,
  ListIcon,
} from "lucide-react";
import type { GraphState } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LGMessage = any;

const SUGGESTIONS = [
  { text: "What's the weather in Seoul?", icon: CloudIcon },
  { text: "Search the web for LangGraph", icon: SearchIcon },
  { text: "Tell me a joke", icon: SmileIcon },
];

function App() {
  const [input, setInput] = useState("");
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  // "always approve" per tool name — persists for session
  const [autoApproveTools, setAutoApproveTools] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem("lg:autoApproveTools");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const thread = useStream<GraphState>({
    apiUrl: `${window.location.origin}/api`,
    assistantId: "agent",
    messagesKey: "messages",
    fetchStateHistory: true,
    onCreated(run) {
      setSavedRunId(run.run_id);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interrupt = thread.interrupt as any;
  const getMetadata = thread.getMessagesMetadata;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history = (thread.history ?? []) as any[];

  // Fetch available models
  useEffect(() => {
    fetch(`${window.location.origin}/api/models`)
      .then((r) => r.json())
      .then((data: Model[]) => {
        setModels(data);
        if (!selectedModel) {
          const def = data.find((m) => m.is_default);
          setSelectedModel(def?.model_id ?? data[0]?.model_id ?? "");
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist autoApproveTools to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("lg:autoApproveTools", JSON.stringify([...autoApproveTools]));
  }, [autoApproveTools]);

  // Auto-approve: when an interrupt arrives for a tool in the auto-approve set, respond immediately
  const autoApprovedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!interrupt) {
      autoApprovedRef.current = null;
      return;
    }
    const action = interrupt.value?.actionRequests?.[0];
    if (!action) return;
    const toolName = action.action as string;
    // Avoid re-approving the same interrupt
    const interruptKey = JSON.stringify(interrupt.value);
    if (autoApprovedRef.current === interruptKey) return;

    if (autoApproveTools.has(toolName) || autoApproveTools.has("*")) {
      autoApprovedRef.current = interruptKey;
      thread.submit(null, { command: { resume: { decision: "approve" } } });
    }
  }, [interrupt, autoApproveTools, thread]);

  const submitMessage = (text: string) => {
    thread.submit(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { messages: [{ type: "human", content: text }] } as any,
      {
        onDisconnect: "continue",
        streamResumable: true,
        ...(selectedModel ? { config: { configurable: { model: selectedModel } } } : {}),
      },
    );
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    submitMessage(input);
    setInput("");
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEdit = (text: string, metadata: any) => {
    const checkpoint = metadata.firstSeenState?.parent_checkpoint;
    if (!checkpoint) return;
    const newMessage = { type: "human" as const, content: text };
    thread.submit(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { messages: [newMessage] } as any,
      {
        checkpoint,
        streamMode: ["values", "messages-tuple"],
        streamSubgraphs: true,
        streamResumable: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optimisticValues: (prev: any) => {
          const values = metadata.firstSeenState?.values;
          if (!values) return prev;
          return {
            ...values,
            messages: [...(values.messages ?? []), newMessage],
          };
        },
      },
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRegenerate = (metadata: any) => {
    const checkpoint = metadata.firstSeenState?.parent_checkpoint;
    if (!checkpoint) return;
    thread.submit(undefined, {
      checkpoint,
      streamMode: ["values", "messages-tuple"],
      streamSubgraphs: true,
      streamResumable: true,
    });
  };

  const isEmpty = thread.messages.length === 0 && !thread.isLoading;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary">
              <SparklesIcon className="size-4 text-primary-foreground" />
            </div>
            <h1 className="text-base font-semibold tracking-tight">
              LangGraph Chat
            </h1>
          </div>
          <ConnectionDot
            isConnected={thread.isLoading}
            savedRunId={savedRunId}
            onDisconnect={() => thread.stop()}
            onRejoin={(id) => thread.joinStream(id)}
          />
        </div>
        <div className="flex items-center gap-1">
          {thread.queue && thread.queue.size > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {thread.queue.size} queued
            </span>
          )}
          <div className="flex rounded-lg bg-muted/60 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="size-7 rounded-md"
              onClick={() => thread.switchThread(null)}
              title="New thread"
            >
              <PlusIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 rounded-md"
              onClick={() => setShowTimeTravel(!showTimeTravel)}
              title="Time travel"
            >
              {showTimeTravel ? (
                <PanelRightCloseIcon className="size-3.5" />
              ) : (
                <PanelRightOpenIcon className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="relative flex flex-1 flex-col">
          <ChatContainerRoot className="relative flex-1 px-4">
            <ChatContainerContent className="mx-auto max-w-3xl gap-3 py-6">
              {/* Empty state */}
              {isEmpty && (
                <div className="flex flex-1 flex-col items-center justify-center gap-6 pt-24">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
                    <SparklesIcon className="size-8 text-primary" />
                  </div>
                  <div className="space-y-2 text-center">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      What can I help you with?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Powered by LangGraph &middot; Human-in-the-Loop enabled
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {SUGGESTIONS.map((s) => (
                      <PromptSuggestion
                        key={s.text}
                        className="h-auto gap-2 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        onClick={() => submitMessage(s.text)}
                      >
                        <s.icon className="size-4 shrink-0 text-primary/70" />
                        <span className="text-sm">{s.text}</span>
                      </PromptSuggestion>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages — grouped into turns (AI turn = tool calls + text in one bubble) */}
              {(() => {
                const turns = groupMessagesIntoTurns(thread.messages);
                // Filter out empty AI turns, BUT keep the last AI turn during
                // streaming so the bubble stays mounted (no layout jump).
                const filtered = turns.filter((t, i) => {
                  if (!isTurnEmpty(t)) return true;
                  // Keep last empty AI turn while streaming — it will show a loader inside
                  if (thread.isLoading && t.type === "ai" && i === turns.length - 1) return true;
                  return false;
                });
                return filtered.map((turn, idx) => {
                  const isLast = idx === filtered.length - 1;
                  const firstMsg = turn.messages[0];
                  const lastMsg = turn.messages[turn.messages.length - 1];
                  const meta = getMetadata
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? (getMetadata(lastMsg) as any)
                    : null;

                  if (turn.type === "human") {
                    return (
                      <HumanMessageItem
                        key={firstMsg.id}
                        message={firstMsg}
                        isStreaming={thread.isLoading && isLast}
                        metadata={meta}
                        onEdit={handleEdit}
                        onBranchSwitch={(id) => thread.setBranch(id)}
                      />
                    );
                  }

                  return (
                    <AITurnItem
                      key={firstMsg.id}
                      turn={turn}
                      allMessages={thread.messages}
                      isStreaming={thread.isLoading && isLast}
                      metadata={meta}
                      onRegenerate={handleRegenerate}
                      onBranchSwitch={(id) => thread.setBranch(id)}
                    />
                  );
                });
              })()}

              {/* HITL interrupt card */}
              {interrupt && (
                <HitlCard
                  interrupt={interrupt}
                  onRespond={(response) =>
                    thread.submit(null, { command: { resume: response } })
                  }
                  autoApproveTools={autoApproveTools}
                  onAutoApprove={(toolName) =>
                    setAutoApproveTools((prev) => new Set([...prev, toolName]))
                  }
                />
              )}

              <ChatContainerScrollAnchor />
            </ChatContainerContent>

            <ScrollButton className="absolute bottom-4 right-4 z-10 shadow-md" />
          </ChatContainerRoot>

          {/* Gradient fade */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />

          {/* Error & Queue — above input, same width as chat messages */}
          {(thread.error != null || (thread.queue && thread.queue.size > 0)) && (
            <div className="mx-auto max-w-3xl w-full space-y-2 pb-2">
              {thread.error != null && (
                <ErrorBanner
                  error={thread.error}
                  onRetry={() => {
                    const last = thread.messages[thread.messages.length - 1];
                    if (last?.type === "human") {
                      submitMessage(extractTextFromMessage(last));
                    }
                  }}
                  onDismiss={() => (thread as any).stopStream?.(false)}
                />
              )}
              {thread.queue && thread.queue.size > 0 && (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <QueueDisplay queue={thread.queue as any} />
              )}
            </div>
          )}

          {/* Input */}
          <div className="relative bg-background px-4 pb-4 pt-2">
            {models.length > 0 && (
              <div className="mx-auto mb-1 max-w-3xl">
                <ModelSelector
                  models={models}
                  selectedModelId={selectedModel}
                  onModelChange={setSelectedModel}
                  disabled={thread.isLoading}
                />
              </div>
            )}
            <PromptInput
              value={input}
              onValueChange={setInput}
              onSubmit={handleSubmit}
              isLoading={thread.isLoading}
              className="mx-auto max-w-3xl shadow-sm transition-shadow focus-within:shadow-md"
            >
              <PromptInputTextarea placeholder="Type a message..." />
              <PromptInputActions className="justify-end px-2 pb-2">
                {thread.isLoading ? (
                  <PromptInputAction tooltip="Stop">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="size-8 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        thread.stop();
                      }}
                    >
                      <SquareIcon className="size-3.5" />
                    </Button>
                  </PromptInputAction>
                ) : (
                  <PromptInputAction tooltip="Send">
                    <Button
                      size="sm"
                      className="size-8 rounded-full bg-primary transition-transform active:scale-90"
                      disabled={!input.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubmit();
                      }}
                    >
                      <ArrowUpIcon className="size-3.5" />
                    </Button>
                  </PromptInputAction>
                )}
              </PromptInputActions>
            </PromptInput>
            <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground/60">
              LangGraph may produce inaccurate information
            </p>
          </div>
        </div>

        {/* Time Travel sidebar */}
        {showTimeTravel && (
          <TimeTravelPanel
            history={history}
            onResumeFrom={(checkpoint) => thread.submit(undefined, {
              checkpoint,
              streamMode: ["values", "messages-tuple"],
              streamSubgraphs: true,
              streamResumable: true,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tool Calls Renderer ─────────────────────────────────────

function ToolCallsRenderer({
  toolCalls,
  allMessages,
  isStreaming,
}: {
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  allMessages: LGMessage[];
  isStreaming?: boolean;
}) {
  const toolParts = toolCalls.map((tc) => {
    const resultMsg = allMessages.find(
      (m: LGMessage) => m.type === "tool" && m.tool_call_id === tc.id
    );
    return {
      type: tc.name,
      state: (resultMsg
        ? "output-available"
        : isStreaming
          ? "input-streaming"
          : "input-available") as "input-streaming" | "input-available" | "output-available",
      input: tc.args,
      output: resultMsg?.content,
      toolCallId: tc.id,
    };
  });

  if (toolParts.length === 1) {
    return <Tool toolPart={toolParts[0]} />;
  }
  return <ToolGroup tools={toolParts} />;
}

// ── Message Grouping ────────────────────────────────────────
// Group messages into "turns": human turns (single msg) and AI turns
// (consecutive AI + tool messages). This renders tool calls and the
// follow-up text response in the same bubble.

type MessageTurn = { type: "human"; messages: LGMessage[] } | { type: "ai"; messages: LGMessage[] };

function groupMessagesIntoTurns(messages: LGMessage[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  for (const msg of messages) {
    if (msg.type === "human") {
      turns.push({ type: "human", messages: [msg] });
    } else if (msg.type === "ai" || msg.type === "tool") {
      const last = turns[turns.length - 1];
      if (last?.type === "ai") {
        last.messages.push(msg);
      } else {
        turns.push({ type: "ai", messages: [msg] });
      }
    }
  }
  return turns;
}

function extractTextFromMessage(msg: LGMessage): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (msg as any).text ?? (
    typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text ?? "").join("")
        : ""
  );
}

function isTurnEmpty(turn: MessageTurn): boolean {
  if (turn.type === "human") return false;
  return turn.messages.every((msg) => {
    if (msg.type === "tool") return true; // tool messages alone don't make a turn visible
    if (msg.type !== "ai") return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasToolCalls = ((msg as any).tool_calls ?? []).length > 0;
    if (hasToolCalls) return false;
    const text = extractTextFromMessage(msg);
    return !text.trim();
  });
}

// ── Chat Message (Human) ────────────────────────────────────

function HumanMessageItem({
  message,
  isStreaming,
  metadata,
  onEdit,
  onBranchSwitch,
}: {
  message: LGMessage;
  isStreaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit?: (text: string, metadata: any) => void;
  onBranchSwitch?: (branchId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  // Only animate on first mount — never re-trigger after streaming ends
  const wasStreamingRef = useRef(false);
  if (isStreaming) wasStreamingRef.current = true;
  const skipAnimation = wasStreamingRef.current;
  const textContent = extractTextFromMessage(message);

  return (
    <div className={`group ${skipAnimation ? "" : "animate-in fade-in-0 duration-300"} flex justify-end`}>
      <div className="max-w-[80%]">
        <Message className="flex-row-reverse">
          <div className="flex-1 space-y-1">
            {isEditing ? (
              <div className="space-y-2 rounded-xl border bg-card p-3">
                <textarea
                  className="w-full resize-none rounded-lg border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (metadata && onEdit) onEdit(editText, metadata);
                      setIsEditing(false);
                    }}
                  >
                    Save & Rerun
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : textContent ? (
              <MessageContent
                className="rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm whitespace-pre-wrap"
              >
                {textContent}
              </MessageContent>
            ) : null}

            {!isEditing && (
              <div className="flex h-7 items-center gap-0.5 justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {textContent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(textContent);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <CheckIcon className="size-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                  </Button>
                )}
                {metadata?.firstSeenState?.parent_checkpoint && onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditText(textContent);
                      setIsEditing(true);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                )}
                {metadata?.branchOptions != null && metadata.branchOptions.length > 1 && onBranchSwitch && (
                  <BranchSwitcher metadata={metadata} onSwitch={onBranchSwitch} />
                )}
              </div>
            )}
          </div>
        </Message>
      </div>
    </div>
  );
}

// ── Chat Message (AI Turn) ──────────────────────────────────
// Renders an entire AI turn: possibly multiple AI messages and tool results
// in a single bubble.

function AITurnItem({
  turn,
  allMessages,
  isStreaming,
  metadata,
  onRegenerate,
  onBranchSwitch,
}: {
  turn: MessageTurn;
  allMessages: LGMessage[];
  isStreaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRegenerate?: (metadata: any) => void;
  onBranchSwitch?: (branchId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  // Only animate on first mount — never re-trigger after streaming ends
  const wasStreamingRef = useRef(false);
  if (isStreaming) wasStreamingRef.current = true;
  const skipAnimation = wasStreamingRef.current;

  // Collect all tool calls, text, and reasoning from AI messages in this turn
  const allToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  const textParts: string[] = [];
  let reasoningText = "";
  let lastAiId: string | undefined;

  for (const msg of turn.messages) {
    if (msg.type === "ai") {
      lastAiId = msg.id;
      const tc = (msg as any).tool_calls ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
      allToolCalls.push(...tc);

      const text = extractTextFromMessage(msg);
      if (text.trim()) textParts.push(text);

      const contentBlocks = (
        msg.contentBlocks ??
        (Array.isArray(msg.content) ? msg.content : undefined)
      ) as Array<{ type: string; reasoning?: string }> | undefined;
      const r = contentBlocks
        ?.filter((b) => b.type === "reasoning" && b.reasoning?.trim())
        .map((b) => b.reasoning)
        .join("") ?? "";
      if (r) reasoningText += r;
    }
    // tool messages are consumed by ToolCallsRenderer via allMessages
  }

  const combinedText = textParts.join("");

  return (
    <div className={`group ${skipAnimation ? "" : "animate-in fade-in-0 duration-300"}`}>
      <div className="w-full">
        <Message>
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
            <SparklesIcon className="size-4 text-primary-foreground" />
          </div>

          <div className="flex-1 space-y-1">
            {/* Reasoning */}
            {reasoningText && (
              <Reasoning isStreaming={isStreaming}>
                <ReasoningTrigger>
                  {isStreaming ? "Thinking..." : "View reasoning"}
                </ReasoningTrigger>
                <ReasoningContent markdown>{reasoningText}</ReasoningContent>
              </Reasoning>
            )}

            {/* Tool calls (all tool calls from this turn, merged with results) */}
            {allToolCalls.length > 0 && (
              <ToolCallsRenderer toolCalls={allToolCalls} allMessages={allMessages} isStreaming={isStreaming && !combinedText} />
            )}

            {/* Text content (combined from all AI messages in this turn) */}
            {combinedText ? (
              <MessageContent
                markdown
                id={lastAiId}
                className={`rounded-2xl bg-secondary/60 px-4 py-3 ${isStreaming ? "border-b-2 border-primary/30 animate-pulse" : ""}`}
              >
                {combinedText}
              </MessageContent>
            ) : null}

            {/* Inline loader — shown when AI turn has no content yet */}
            {isStreaming && !combinedText && allToolCalls.length === 0 && !reasoningText && (
              <div className="rounded-2xl bg-secondary/60 px-4 py-3">
                <Loader variant="text-shimmer" size="sm" text="Thinking" />
              </div>
            )}

            {/* Action bar — fixed h-7 so layout doesn't shift when buttons appear */}
            <div className="flex h-7 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {combinedText && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(combinedText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <CheckIcon className="size-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                  </Button>
                )}
                {metadata?.firstSeenState?.parent_checkpoint && onRegenerate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onRegenerate(metadata)}
                  >
                    <RefreshCwIcon className="size-3.5" />
                  </Button>
                )}
                {metadata?.branchOptions != null && metadata.branchOptions.length > 1 && onBranchSwitch && (
                  <BranchSwitcher metadata={metadata} onSwitch={onBranchSwitch} />
                )}
              </div>
          </div>
        </Message>
      </div>
    </div>
  );
}

// ── Branch Switcher ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BranchSwitcher({ metadata, onSwitch }: { metadata: any; onSwitch: (id: string) => void }) {
  const branch = metadata?.branch;
  const branchOptions = metadata?.branchOptions as string[] | undefined;
  if (!branchOptions || branchOptions.length <= 1) return null;

  const idx = branch != null ? branchOptions.indexOf(branch) : -1;
  const current = idx >= 0 ? idx + 1 : 1;

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1 py-0.5 text-xs font-medium text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        disabled={idx <= 0}
        onClick={(e) => { e.stopPropagation(); onSwitch(branchOptions[idx - 1]); }}
        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
      >
        &lt;
      </Button>
      <span className="px-1">{current}/{branchOptions.length}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={idx >= branchOptions.length - 1}
        onClick={(e) => { e.stopPropagation(); onSwitch(branchOptions[idx + 1]); }}
        className="size-6 rounded-full text-muted-foreground hover:text-foreground"
      >
        &gt;
      </Button>
    </span>
  );
}

// ── HITL Card ───────────────────────────────────────────────

interface HitlResponse {
  decision: "approve" | "reject" | "edit";
  reason?: string;
  args?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HitlCard({ interrupt, onRespond, autoApproveTools, onAutoApprove }: {
  interrupt: any;
  onRespond: (r: HitlResponse) => void;
  autoApproveTools?: Set<string>;
  onAutoApprove?: (toolName: string) => void;
}) {
  const [mode, setMode] = useState<"review" | "edit" | "reject">("review");
  const [rejectReason, setRejectReason] = useState("");
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>({});

  const request = interrupt.value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actions = (request?.actionRequests ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configs = (request?.reviewConfigs ?? []) as any[];
  const config = configs[0];
  if (actions.length === 0 || !config) return null;

  // Unique tool names for auto-approve
  const toolNames = [...new Set(actions.map((a: { action: string }) => a.action))];

  return (
    <div className="mx-auto my-2 w-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
            <ShieldCheckIcon className="size-4 text-amber-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Review Required</h3>
            <p className="text-xs text-muted-foreground">
              {actions.length === 1
                ? `Agent wants to execute: ${actions[0].action}`
                : `Agent wants to execute ${actions.length} actions`}
            </p>
          </div>
        </div>

        {/* Tool call list */}
        <div className="divide-y divide-border">
          {actions.map((action: { action: string; args: Record<string, unknown>; description?: string }, i: number) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
                  {action.action}
                </span>
                {action.description && (
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                )}
              </div>
              {action.args && Object.keys(action.args).length > 0 && (
                <pre className="mt-2 overflow-auto rounded-lg bg-muted/50 p-2.5 font-mono text-xs text-muted-foreground">
                  {JSON.stringify(action.args, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="border-t border-border px-4 py-3">
          {mode === "review" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {config.allowedDecisions.includes("approve") && (
                  <Button
                    size="sm"
                    onClick={() => onRespond({ decision: "approve" })}
                  >
                    Approve{actions.length > 1 ? ` All (${actions.length})` : ""}
                  </Button>
                )}
                {config.allowedDecisions.includes("reject") && (
                  <Button variant="destructive" size="sm" onClick={() => setMode("reject")}>
                    Reject
                  </Button>
                )}
                {actions.length === 1 && config.allowedDecisions.includes("edit") && (
                  <Button variant="outline" size="sm" onClick={() => { setEditedArgs(actions[0].args); setMode("edit"); }}>
                    Edit
                  </Button>
                )}
              </div>
              {config.allowedDecisions.includes("approve") && onAutoApprove && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {toolNames.map((name) =>
                    !autoApproveTools?.has(name) ? (
                      <Button
                        key={name}
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                        onClick={() => {
                          onAutoApprove(name);
                          onRespond({ decision: "approve" });
                        }}
                      >
                        <ShieldCheckIcon className="size-3" />
                        Always approve {name}
                      </Button>
                    ) : null
                  )}
                  {!autoApproveTools?.has("*") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                      onClick={() => {
                        onAutoApprove("*");
                        onRespond({ decision: "approve" });
                      }}
                    >
                      <ShieldCheckIcon className="size-3" />
                      Always approve all
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === "reject" && (
            <div className="space-y-3">
              <Textarea
                placeholder="Reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                className="min-h-0 text-sm"
              />
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={() => onRespond({ decision: "reject", reason: rejectReason })}>
                  Confirm Rejection
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode("review")}>Back</Button>
              </div>
            </div>
          )}

          {mode === "edit" && (
            <div className="space-y-3">
              <Textarea
                value={JSON.stringify(editedArgs, null, 2)}
                onChange={(e) => { try { setEditedArgs(JSON.parse(e.target.value)); } catch { /* allow while editing */ } }}
                rows={6}
                className="min-h-0 font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onRespond({ decision: "edit", args: editedArgs })}>Submit Edits</Button>
                <Button variant="ghost" size="sm" onClick={() => setMode("review")}>Back</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Connection Status ───────────────────────────────────────

function ConnectionDot({ isConnected, savedRunId, onDisconnect, onRejoin }: {
  isConnected: boolean; savedRunId: string | null; onDisconnect: () => void; onRejoin: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full transition-colors ${isConnected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
      <span className="text-[11px] text-muted-foreground">{isConnected ? "Active" : "Idle"}</span>
      {isConnected ? (
        <Button variant="ghost" size="sm" className="size-5 rounded" onClick={onDisconnect}><WifiOffIcon className="size-3" /></Button>
      ) : savedRunId ? (
        <Button variant="ghost" size="sm" className="size-5 rounded" onClick={() => onRejoin(savedRunId)}><PlugIcon className="size-3" /></Button>
      ) : null}
    </div>
  );
}

// ── Error Banner ────────────────────────────────────────────

function ErrorBanner({
  error,
  onRetry,
  onDismiss,
}: {
  error: unknown;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  const message = String((error as Error)?.message ?? error);
  return (
    <div className="animate-in slide-in-from-bottom-2 duration-200 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircleIcon className="size-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">Something went wrong</p>
          <p className="mt-0.5 text-xs text-destructive/80 truncate">{message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-destructive/30 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onRetry}
            >
              <RefreshCwIcon className="size-3" />
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="size-7 text-destructive/60 hover:text-destructive"
              onClick={onDismiss}
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Queue Display ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QueueDisplay({ queue }: { queue: any }) {
  return (
    <div className="animate-in slide-in-from-bottom-1 duration-200 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded bg-primary/10">
              <ListIcon className="size-3 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {queue.size} message{queue.size > 1 ? "s" : ""} queued
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={() => queue.clear()}
          >
            <XIcon className="size-3" />
            Clear all
          </Button>
        </div>
        <div className="mt-2 space-y-1">
          {queue.entries.slice(0, 3).map((entry: { id: string; values: Record<string, unknown> }, i: number) => {
            const msgs = entry.values?.messages as Array<{ content: string }> | undefined;
            return (
              <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {msgs?.[0]?.content ?? "..."}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-5 shrink-0 text-muted-foreground/50 hover:text-destructive"
                  onClick={() => queue.cancel(entry.id)}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            );
          })}
          {queue.size > 3 && (
            <p className="text-center text-[11px] text-muted-foreground/60">
              +{queue.size - 3} more
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Time Travel Panel ───────────────────────────────────────

function getLastMessagePreview(messages: LGMessage[]): { type: string; text: string } | null {
  if (!messages || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  const type = last.type ?? "unknown";
  let text = "";
  if (typeof last.content === "string") {
    text = last.content;
  } else if (Array.isArray(last.content)) {
    const textBlock = last.content.find((b: { type: string }) => b.type === "text");
    text = textBlock?.text ?? JSON.stringify(last.content);
  }
  return { type, text: text.slice(0, 120) };
}

function getNodeLabel(state: { next?: string[]; tasks?: Array<{ name: string }> }): string | null {
  if (state.next && state.next.length > 0) return state.next.join(", ");
  if (state.tasks && state.tasks.length > 0) return state.tasks.map((t) => t.name).join(", ");
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TimeTravelPanel({ history, onResumeFrom }: { history: any[]; onResumeFrom: (c: any) => void }) {
  return (
    <div className="flex w-80 flex-col border-l bg-muted/20">
      <div className="flex items-center gap-2 border-b p-3">
        <HistoryIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Time Travel</h3>
        <span className="ml-auto text-xs text-muted-foreground">{history.length}</span>
      </div>
      {history.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No history</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {history.map((state: {
            checkpoint: { checkpoint_id: string };
            next?: string[];
            tasks?: Array<{ name: string }>;
            values?: { messages?: LGMessage[] };
            metadata?: { step?: number };
          }, i: number) => {
            const messages = (state.values?.messages ?? []) as LGMessage[];
            const preview = getLastMessagePreview(messages);
            const nodeLabel = getNodeLabel(state);
            const step = state.metadata?.step ?? history.length - i;
            const isEnd = !state.next || state.next.length === 0;

            return (
              <div key={state.checkpoint.checkpoint_id} className="group mb-1.5 rounded-lg border bg-card p-2.5 transition-all hover:shadow-sm">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                      Step {step}
                    </span>
                    {nodeLabel && (
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {isEnd ? "END" : `→ ${nodeLabel}`}
                      </span>
                    )}
                    {!nodeLabel && isEnd && (
                      <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                        END
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => onResumeFrom(state.checkpoint)}
                    title="Resume from here"
                  >
                    <PlayIcon className="size-3" />
                  </Button>
                </div>
                {preview && (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-medium ${
                        preview.type === "human"
                          ? "text-blue-500"
                          : preview.type === "ai"
                            ? "text-violet-500"
                            : "text-orange-500"
                      }`}>
                        {preview.type === "human" ? "User" : preview.type === "ai" ? "AI" : "Tool"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {messages.length} msg{messages.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {preview.text || "(empty)"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;
