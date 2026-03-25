"""Define a custom Reasoning and Action agent with Human-in-the-Loop.

Works with a chat model with tool calling support.
The agent pauses before tool execution for human approval via interrupt().
"""

import logging
from datetime import UTC, datetime
from typing import Literal, cast

from langchain_core.messages import AIMessage, ToolMessage
from langgraph.graph import StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt

from agent.context import Context
from agent.state import InputState, State
from agent.tools import TOOLS
from agent.utils import load_chat_model

logger = logging.getLogger(__name__)


async def call_model(
    state: State, runtime: Runtime[Context]
) -> dict[str, list[AIMessage]]:
    """Call the LLM powering our agent."""
    model = load_chat_model(runtime.context.model)
    if TOOLS:
        model = model.bind_tools(TOOLS)

    system_message = runtime.context.system_prompt.format(
        system_time=datetime.now(tz=UTC).isoformat()
    )

    # Use astream so LangGraph's StreamMessagesHandler can emit per-token events
    response = None
    async for chunk in model.astream(
        [{"role": "system", "content": system_message}, *state.messages]
    ):
        response = chunk if response is None else response + chunk
    response = cast(AIMessage, response)

    if state.is_last_step and response.tool_calls:
        return {
            "messages": [
                AIMessage(
                    id=response.id,
                    content="Sorry, I could not find an answer to your question in the specified number of steps.",
                )
            ]
        }

    return {"messages": [response]}


def human_review(state: State) -> Command[Literal["tools", "call_model"]]:
    """Pause for human approval before executing tool calls.

    Uses interrupt() to surface tool calls to the frontend.
    The frontend's HitlCard component renders the review UI.
    """
    last_message = state.messages[-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return Command(goto="call_model")

    tool_calls = last_message.tool_calls

    # Build the review request matching frontend's HitlRequest interface
    review_request = {
        "actionRequests": [
            {
                "action": tc["name"],
                "args": tc["args"],
                "description": f"Execute tool: {tc['name']}",
            }
            for tc in tool_calls
        ],
        "reviewConfigs": [
            {"allowedDecisions": ["approve", "reject", "edit"]} for _ in tool_calls
        ],
    }

    logger.info("HITL interrupt: awaiting review for %d tool call(s)", len(tool_calls))
    response = interrupt(review_request)

    decision = response.get("decision", "approve")

    if decision == "approve":
        logger.info("HITL: tool calls approved")
        return Command(goto="tools")

    if decision == "edit":
        # Replace tool call args with edited args
        edited_args = response.get("args", {})
        logger.info("HITL: tool calls edited")
        edited_tool_calls = [
            {**tc, "args": edited_args} if i == 0 else tc
            for i, tc in enumerate(tool_calls)
        ]
        edited_message = AIMessage(
            content=last_message.content,
            tool_calls=edited_tool_calls,
            id=last_message.id,
        )
        return Command(
            update={"messages": [edited_message]},
            goto="tools",
        )

    # decision == "reject"
    reason = response.get("reason", "Action rejected by user")
    logger.info("HITL: tool calls rejected — %s", reason)
    rejection_messages = [
        ToolMessage(
            content=f"Tool call rejected: {reason}",
            tool_call_id=tc["id"],
        )
        for tc in tool_calls
    ]
    return Command(
        update={"messages": rejection_messages},
        goto="call_model",
    )


def route_model_output(state: State) -> Literal["__end__", "human_review"]:
    """Determine the next node based on the model's output."""
    last_message = state.messages[-1]
    if not isinstance(last_message, AIMessage):
        raise ValueError(
            f"Expected AIMessage in output edges, but got {type(last_message).__name__}"
        )
    if not last_message.tool_calls:
        return "__end__"
    return "human_review"


# Build the graph
builder = StateGraph(State, input_schema=InputState, context_schema=Context)

builder.add_node(call_model)
builder.add_node(human_review)
builder.add_node("tools", ToolNode(TOOLS))

builder.add_edge("__start__", "call_model")
builder.add_conditional_edges("call_model", route_model_output)
# human_review routes via Command (approve → tools, reject → call_model)
builder.add_edge("tools", "call_model")

graph = builder.compile(name="ReAct Agent")

__all__ = ["graph", "builder"]
