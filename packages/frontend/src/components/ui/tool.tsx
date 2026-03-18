import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Settings,
  XCircle,
} from "lucide-react"
import { useState } from "react"

export type ToolPart = {
  type: string
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
  input?: Record<string, unknown>
  output?: unknown
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

/** Format args inline: `key: "val", key2: 42` — truncated if long */
function formatArgsInline(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => {
    const val = typeof v === "string" ? `"${v}"` : JSON.stringify(v)
    return `${k}: ${val}`
  })
  const full = parts.join(", ")
  return full.length > 80 ? full.slice(0, 77) + "..." : full
}

/** Pretty-print any output value */
function formatOutput(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const { state, input, output } = toolPart

  const stateIcon = {
    "input-streaming": <Loader2 className="size-3.5 animate-spin text-blue-500" />,
    "input-available": <Settings className="size-3.5 text-orange-500" />,
    "output-available": <CheckCircle className="size-3.5 text-green-500" />,
    "output-error": <XCircle className="size-3.5 text-red-500" />,
  }[state] ?? <Settings className="size-3.5 text-muted-foreground" />

  const hasArgs = input && Object.keys(input).length > 0
  const outputStr = formatOutput(output)
  const hasContent =
    outputStr ||
    (state === "output-error" && toolPart.errorText) ||
    state === "input-streaming"

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-muted/30",
        className
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="h-auto w-full justify-between rounded-b-none px-3 py-2 font-normal hover:bg-muted/50"
            />
          }
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {stateIcon}
            <span className="font-mono text-xs font-medium">
              {toolPart.type}
            </span>
            {hasArgs && (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                ({formatArgsInline(input)})
              </span>
            )}
          </div>
          {hasContent && (
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          )}
        </CollapsibleTrigger>

        {hasContent && (
          <CollapsibleContent
            className={cn(
              "border-t border-border",
              "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
            )}
          >
            <div className="max-h-60 overflow-auto p-3 font-mono text-xs">
              {state === "input-streaming" && (
                <span className="text-muted-foreground">Running...</span>
              )}

              {state === "output-error" && toolPart.errorText && (
                <span className="text-red-500">{toolPart.errorText}</span>
              )}

              {outputStr && (
                <pre className="whitespace-pre-wrap text-foreground">
                  {outputStr}
                </pre>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

export { Tool }
