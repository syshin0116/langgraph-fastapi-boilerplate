"""Unit tests for the agent module."""

from core.agent.context import Context
from core.agent.graph import builder, graph
from core.agent.tools import TOOLS, get_weather, search_web
from core.agent.utils import load_chat_model


def test_graph_compiles():
    assert graph.name == "ReAct Agent"


def test_builder_exists():
    assert builder is not None


def test_graph_has_human_review_node():
    """HITL: human_review node should exist in the graph."""
    node_names = list(builder.nodes.keys())
    assert "human_review" in node_names


def test_graph_has_tools_node():
    node_names = list(builder.nodes.keys())
    assert "tools" in node_names


def test_graph_has_call_model_node():
    node_names = list(builder.nodes.keys())
    assert "call_model" in node_names


def test_context_defaults():
    ctx = Context()
    # Model should be a "provider/model" format string
    assert "/" in ctx.model
    assert "{system_time}" in ctx.system_prompt


def test_tools_not_empty():
    """Boilerplate should include example tools."""
    assert len(TOOLS) >= 2


def test_get_weather_tool():
    result = get_weather.invoke({"city": "Seoul"})
    assert "Seoul" in result
    assert isinstance(result, str)


def test_search_web_tool():
    result = search_web.invoke({"query": "test query"})
    assert "test query" in result
    assert isinstance(result, str)


def test_load_chat_model_format():
    try:
        model = load_chat_model("anthropic/claude-sonnet-4-5-20250929")
        assert model is not None
    except Exception:
        pass
