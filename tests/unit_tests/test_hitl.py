"""Unit tests for Human-in-the-Loop interrupt flow."""

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from core.agent.graph import builder


@pytest.fixture
def compiled_graph():
    """Compile the graph with an in-memory checkpointer for testing."""
    return builder.compile(
        name="ReAct Agent",
        checkpointer=InMemorySaver(),
    )


def _make_config(thread_id: str = "test-thread"):
    return {"configurable": {"thread_id": thread_id}}


@pytest.mark.asyncio
async def test_hitl_interrupt_on_tool_call(compiled_graph):
    """When the model makes a tool call, the graph should interrupt for human review.

    Since interrupt() requires a graph execution context, we test this by
    invoking the compiled graph with a pre-populated state that includes
    a tool-calling AI message, and verify the graph pauses with __interrupt__.
    """
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import StateGraph, START, END
    from core.agent.state import State

    # Build a minimal graph that just runs human_review
    from core.agent.graph import human_review

    mini_builder = StateGraph(State)
    mini_builder.add_node("human_review", human_review)
    mini_builder.add_node("tools", lambda s: s)  # dummy
    mini_builder.add_node("call_model", lambda s: s)  # dummy
    mini_builder.add_edge(START, "human_review")
    mini_builder.add_edge("tools", END)
    mini_builder.add_edge("call_model", END)
    mini_graph = mini_builder.compile(checkpointer=InMemorySaver())

    config = _make_config("test-interrupt")
    result = await mini_graph.ainvoke(
        {
            "messages": [
                HumanMessage(content="What's the weather in Seoul?"),
                AIMessage(
                    content="Let me check the weather.",
                    tool_calls=[
                        {
                            "id": "call_123",
                            "name": "get_weather",
                            "args": {"city": "Seoul"},
                        }
                    ],
                ),
            ]
        },
        config,
    )

    # Graph should have paused with an interrupt
    assert "__interrupt__" in result
    interrupts = result["__interrupt__"]
    assert len(interrupts) > 0

    # The interrupt value should match the frontend's HitlRequest structure
    interrupt_value = interrupts[0].value
    assert "actionRequests" in interrupt_value
    assert "reviewConfigs" in interrupt_value
    assert interrupt_value["actionRequests"][0]["action"] == "get_weather"
    assert interrupt_value["actionRequests"][0]["args"] == {"city": "Seoul"}


@pytest.mark.asyncio
async def test_hitl_no_interrupt_without_tool_calls():
    """When AI message has no tool calls, human_review should skip."""
    from core.agent.graph import human_review
    from core.agent.state import State

    state = State(
        messages=[
            HumanMessage(content="Hello"),
            AIMessage(content="Hi there!"),
        ]
    )

    result = human_review(state)
    # Should route to call_model without interrupting
    assert isinstance(result, Command)
    assert result.goto == "call_model"


@pytest.mark.asyncio
async def test_hitl_approve_resumes_to_tools():
    """After approving, the graph should proceed to tool execution."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import StateGraph, START, END
    from core.agent.graph import human_review
    from core.agent.state import State
    from core.agent.tools import TOOLS
    from langgraph.prebuilt import ToolNode

    mini_builder = StateGraph(State)
    mini_builder.add_node("human_review", human_review)
    mini_builder.add_node("tools", ToolNode(TOOLS))
    mini_builder.add_node("call_model", lambda s: s)
    mini_builder.add_edge(START, "human_review")
    mini_builder.add_edge("tools", END)
    mini_builder.add_edge("call_model", END)
    mini_graph = mini_builder.compile(checkpointer=InMemorySaver())

    config = _make_config("test-approve")

    # Step 1: hit the interrupt
    result = await mini_graph.ainvoke(
        {
            "messages": [
                HumanMessage(content="What's the weather in Seoul?"),
                AIMessage(
                    content="Let me check.",
                    tool_calls=[
                        {"id": "call_1", "name": "get_weather", "args": {"city": "Seoul"}}
                    ],
                ),
            ]
        },
        config,
    )
    assert "__interrupt__" in result

    # Step 2: approve → should execute the tool
    result = await mini_graph.ainvoke(
        Command(resume={"decision": "approve"}),
        config,
    )

    # Tool should have been executed — messages should contain a ToolMessage
    messages = result.get("messages", [])
    tool_msgs = [m for m in messages if isinstance(m, ToolMessage)]
    assert len(tool_msgs) > 0
    assert "Seoul" in tool_msgs[0].content


@pytest.mark.asyncio
async def test_hitl_reject_returns_rejection_message():
    """After rejecting, the graph should add rejection messages and go to call_model."""
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import StateGraph, START, END
    from core.agent.graph import human_review
    from core.agent.state import State

    mini_builder = StateGraph(State)
    mini_builder.add_node("human_review", human_review)
    mini_builder.add_node("tools", lambda s: s)
    mini_builder.add_node("call_model", lambda s: s)
    mini_builder.add_edge(START, "human_review")
    mini_builder.add_edge("tools", END)
    mini_builder.add_edge("call_model", END)
    mini_graph = mini_builder.compile(checkpointer=InMemorySaver())

    config = _make_config("test-reject")

    # Step 1: hit the interrupt
    await mini_graph.ainvoke(
        {
            "messages": [
                HumanMessage(content="What's the weather?"),
                AIMessage(
                    content="Let me check.",
                    tool_calls=[
                        {"id": "call_2", "name": "get_weather", "args": {"city": "Seoul"}}
                    ],
                ),
            ]
        },
        config,
    )

    # Step 2: reject
    result = await mini_graph.ainvoke(
        Command(resume={"decision": "reject", "reason": "Not needed"}),
        config,
    )

    messages = result.get("messages", [])
    tool_msgs = [m for m in messages if isinstance(m, ToolMessage)]
    assert len(tool_msgs) > 0
    assert "rejected" in tool_msgs[0].content.lower() or "Not needed" in tool_msgs[0].content


def test_graph_node_routing():
    """Verify the routing logic: tool_calls → human_review, no tool_calls → END."""
    from core.agent.graph import route_model_output
    from core.agent.state import State

    # No tool calls → END
    state_no_tools = State(
        messages=[AIMessage(content="Hello")]
    )
    assert route_model_output(state_no_tools) == "__end__"

    # With tool calls → human_review
    state_with_tools = State(
        messages=[
            AIMessage(
                content="Let me check.",
                tool_calls=[
                    {"id": "call_1", "name": "get_weather", "args": {"city": "Seoul"}}
                ],
            )
        ]
    )
    assert route_model_output(state_with_tools) == "human_review"
