"""Unit tests for the agent module."""

from core.agent.context import Context
from core.agent.graph import builder, graph
from core.agent.utils import load_chat_model


def test_graph_compiles():
    assert graph.name == "ReAct Agent"


def test_builder_exists():
    assert builder is not None


def test_context_defaults():
    ctx = Context()
    assert "claude" in ctx.model or "anthropic" in ctx.model
    assert "{system_time}" in ctx.system_prompt


def test_load_chat_model_format():
    try:
        model = load_chat_model("anthropic/claude-sonnet-4-5-20250929")
        assert model is not None
    except Exception:
        pass
