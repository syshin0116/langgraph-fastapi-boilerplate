"""Agent tools.

Add custom tools here. Each tool should be a callable that can be bound
to the chat model via `.bind_tools(TOOLS)`.
"""

from typing import Any, Callable

TOOLS: list[Callable[..., Any]] = []
