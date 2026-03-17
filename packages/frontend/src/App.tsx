import { useState } from "react";
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
import { Tool } from "@/components/ui/tool";
import type { ToolPart } from "@/components/ui/tool";
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
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
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

  const submitMessage = (text: string) => {
    thread.submit(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { messages: [{ type: "human", content: text }] } as any,
      { onDisconnect: "continue", streamResumable: true },
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
    thread.submit(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { messages: [{ type: "human", content: text }] } as any,
      { checkpoint },
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRegenerate = (metadata: any) => {
    const checkpoint = metadata.firstSeenState?.parent_checkpoint;
    if (!checkpoint) return;
    thread.submit(undefined, { checkpoint });
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
          <ChatContainerRoot className="flex-1 px-4">
            <ChatContainerContent className="mx-auto max-w-3xl gap-5 py-6">
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

              {/* Messages */}
              {thread.messages.map((msg) => {
                const meta = getMetadata
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ? (getMetadata(msg) as any)
                  : null;
                const isLast =
                  msg === thread.messages[thread.messages.length - 1];

                return (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    isStreaming={thread.isLoading && isLast}
                    metadata={meta}
                    onEdit={handleEdit}
                    onRegenerate={handleRegenerate}
                    onBranchSwitch={(id) => thread.setBranch(id)}
                  />
                );
              })}

              {/* Loading */}
              {thread.isLoading &&
                thread.messages.length > 0 &&
                thread.messages[thread.messages.length - 1].type ===
                  "human" && (
                  <div className="flex items-center gap-3 pl-1">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                      <SparklesIcon className="size-4 text-primary-foreground animate-pulse" />
                    </div>
                    <Loader variant="typing" size="sm" />
                  </div>
                )}

              {/* HITL interrupt card */}
              {interrupt && (
                <HitlCard
                  interrupt={interrupt}
                  onRespond={(response) =>
                    thread.submit(null, { command: { resume: response } })
                  }
                />
              )}

              <ChatContainerScrollAnchor />
            </ChatContainerContent>

            <ScrollButton className="absolute bottom-4 right-4" />
          </ChatContainerRoot>

          {/* Error */}
          {thread.error != null && (
            <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {String((thread.error as Error)?.message ?? thread.error)}
            </div>
          )}

          {/* Queue display */}
          {thread.queue && thread.queue.size > 0 && (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <QueueDisplay queue={thread.queue as any} />
          )}

          {/* Gradient fade */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent" />

          {/* Input */}
          <div className="relative bg-background px-4 pb-4 pt-2">
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onResumeFrom={(checkpoint) => thread.submit(null, { checkpoint } as any)}
          />
        )}
      </div>
    </div>
  );
}

// ── Chat Message ────────────────────────────────────────────

function ChatMessageItem({
  message,
  isStreaming,
  metadata,
  onEdit,
  onRegenerate,
  onBranchSwitch,
}: {
  message: LGMessage;
  isStreaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit?: (text: string, metadata: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRegenerate?: (metadata: any) => void;
  onBranchSwitch?: (branchId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);

  const isHuman = message.type === "human";
  const isAI = message.type === "ai";
  const isTool = message.type === "tool";

  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content);

  // Extended thinking / reasoning blocks
  const contentBlocks = message.contentBlocks as
    | Array<{ type: string; reasoning?: string; text?: string }>
    | undefined;

  const reasoningText =
    contentBlocks
      ?.filter((b: { type: string; reasoning?: string }) => b.type === "reasoning" && b.reasoning?.trim())
      .map((b: { reasoning?: string }) => b.reasoning)
      .join("") ?? "";

  const textContent = contentBlocks
    ? contentBlocks
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text?: string }) => b.text)
        .join("")
    : content;

  // Tool result message
  if (isTool) {
    const toolPart: ToolPart = {
      type: (message.name as string) ?? "tool",
      state: "output-available",
      output: { result: content },
    };
    return <Tool toolPart={toolPart} className="ml-11" />;
  }

  // AI tool_calls
  const toolCalls = isAI ? (message.tool_calls ?? []) : [];

  return (
    <div className={`group animate-in fade-in-0 duration-300 ${isHuman ? "flex justify-end" : ""}`}>
      <div className={isHuman ? "max-w-[80%]" : "w-full"}>
        <Message className={isHuman ? "flex-row-reverse" : ""}>
          {!isHuman && (
            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
              <SparklesIcon className="size-4 text-primary-foreground" />
            </div>
          )}

          <div className="flex-1 space-y-2">
            {/* Reasoning */}
            {reasoningText && (
              <Reasoning isStreaming={isStreaming}>
                <ReasoningTrigger>
                  {isStreaming ? "Thinking..." : "View reasoning"}
                </ReasoningTrigger>
                <ReasoningContent markdown>{reasoningText}</ReasoningContent>
              </Reasoning>
            )}

            {/* Content */}
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
            ) : (
              <MessageContent
                markdown={isAI}
                id={isAI ? message.id : undefined}
                className={
                  isHuman
                    ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground shadow-sm whitespace-pre-wrap"
                    : "rounded-2xl bg-secondary/60 px-4 py-3"
                }
              >
                {textContent}
              </MessageContent>
            )}

            {/* Tool calls */}
            {toolCalls.length > 0 && (
              <div className="space-y-1.5">
                {toolCalls.map((tc: { id: string; name: string; args: Record<string, unknown> }) => (
                  <Tool
                    key={tc.id}
                    toolPart={{
                      type: tc.name,
                      state: isStreaming ? "input-streaming" : "input-available",
                      input: tc.args,
                      toolCallId: tc.id,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Actions */}
            {!isEditing && !isStreaming && (
              <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {isAI && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
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
                    {metadata?.firstSeenState?.parent_checkpoint && onRegenerate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRegenerate(metadata);
                        }}
                      >
                        <RefreshCwIcon className="size-3.5" />
                      </Button>
                    )}
                  </>
                )}
                {isHuman && metadata?.firstSeenState?.parent_checkpoint && onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditText(content);
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

// ── Branch Switcher ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BranchSwitcher({ metadata, onSwitch }: { metadata: any; onSwitch: (id: string) => void }) {
  const branch = metadata?.branch;
  const branchOptions = metadata?.branchOptions as string[] | undefined;
  if (!branchOptions || branchOptions.length <= 1) return null;

  const idx = branch != null ? branchOptions.indexOf(branch) : -1;
  const current = idx >= 0 ? idx + 1 : 1;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <button
        disabled={idx <= 0}
        onClick={(e) => { e.stopPropagation(); onSwitch(branchOptions[idx - 1]); }}
        className="transition-opacity disabled:opacity-30 hover:text-foreground"
      >
        &lt;
      </button>
      <span>{current}/{branchOptions.length}</span>
      <button
        disabled={idx >= branchOptions.length - 1}
        onClick={(e) => { e.stopPropagation(); onSwitch(branchOptions[idx + 1]); }}
        className="transition-opacity disabled:opacity-30 hover:text-foreground"
      >
        &gt;
      </button>
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
function HitlCard({ interrupt, onRespond }: { interrupt: any; onRespond: (r: HitlResponse) => void }) {
  const [mode, setMode] = useState<"review" | "edit" | "reject">("review");
  const [rejectReason, setRejectReason] = useState("");
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>({});

  const request = interrupt.value;
  const action = request?.actionRequests?.[0];
  const config = request?.reviewConfigs?.[0];
  if (!action || !config) return null;

  return (
    <div className="mx-auto my-2 w-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <ShieldCheckIcon className="size-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold">Action Review Required</h3>
            <p className="text-sm text-muted-foreground">
              {action.description ?? `Agent wants to execute: ${action.action}`}
            </p>
          </div>
        </div>

        <pre className="mt-4 overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
          {JSON.stringify(action.args, null, 2)}
        </pre>

        {mode === "review" && (
          <div className="mt-4 flex gap-2">
            {config.allowedDecisions.includes("approve") && (
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => onRespond({ decision: "approve" })}>
                Approve
              </Button>
            )}
            {config.allowedDecisions.includes("reject") && (
              <Button variant="destructive" onClick={() => setMode("reject")}>Reject</Button>
            )}
            {config.allowedDecisions.includes("edit") && (
              <Button variant="outline" onClick={() => { setEditedArgs(action.args); setMode("edit"); }}>Edit</Button>
            )}
          </div>
        )}

        {mode === "reject" && (
          <div className="mt-4 space-y-3">
            <textarea
              className="w-full resize-none rounded-lg border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={() => onRespond({ decision: "reject", reason: rejectReason })}>
                Confirm Rejection
              </Button>
              <Button variant="ghost" onClick={() => setMode("review")}>Back</Button>
            </div>
          </div>
        )}

        {mode === "edit" && (
          <div className="mt-4 space-y-3">
            <textarea
              className="w-full resize-none rounded-lg border bg-background p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={JSON.stringify(editedArgs, null, 2)}
              onChange={(e) => { try { setEditedArgs(JSON.parse(e.target.value)); } catch { /* allow while editing */ } }}
              rows={6}
            />
            <div className="flex gap-2">
              <Button onClick={() => onRespond({ decision: "edit", args: editedArgs })}>Submit Edits</Button>
              <Button variant="ghost" onClick={() => setMode("review")}>Back</Button>
            </div>
          </div>
        )}
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

// ── Queue Display ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QueueDisplay({ queue }: { queue: any }) {
  return (
    <div className="border-t bg-muted/30 px-4 py-2.5">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Queued ({queue.size})</span>
          <button className="text-destructive hover:underline" onClick={() => queue.clear()}>Clear</button>
        </div>
        <div className="mt-1.5 space-y-1">
          {queue.entries.slice(0, 3).map((entry: { id: string; values: Record<string, unknown> }) => {
            const msgs = entry.values?.messages as Array<{ content: string }> | undefined;
            return (
              <div key={entry.id} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{msgs?.[0]?.content ?? "..."}</span>
                <button className="ml-2 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => queue.cancel(entry.id)}>
                  <XIcon className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Time Travel Panel ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TimeTravelPanel({ history, onResumeFrom }: { history: any[]; onResumeFrom: (c: any) => void }) {
  return (
    <div className="flex w-72 flex-col border-l bg-muted/20">
      <div className="flex items-center gap-2 border-b p-3">
        <HistoryIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Time Travel</h3>
        <span className="ml-auto text-xs text-muted-foreground">{history.length}</span>
      </div>
      {history.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No history</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {history.map((state: { checkpoint: { checkpoint_id: string }; tasks?: Array<{ name: string }>; values?: { messages?: unknown[] } }, i: number) => (
            <div key={state.checkpoint.checkpoint_id} className="group mb-1.5 rounded-lg border bg-card p-3 transition-all hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                <Button variant="ghost" size="sm" className="size-6 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => onResumeFrom(state.checkpoint)}>
                  <PlayIcon className="size-3" />
                </Button>
              </div>
              <p className="mt-1 text-sm font-medium">{state.tasks?.[0]?.name ?? "unknown"}</p>
              <p className="text-xs text-muted-foreground">{(state.values?.messages as unknown[] | undefined)?.length ?? 0} messages</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
