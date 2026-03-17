"""Agent tools.

Example tools for the boilerplate. Replace or extend these with your own.
Each tool should be decorated with @tool so it can be bound to the chat model.
"""

from langchain_core.tools import tool


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The city name to get weather for.
    """
    # Stub implementation — replace with a real weather API call
    return f"The weather in {city} is sunny, 22°C."


@tool
def search_web(query: str) -> str:
    """Search the web for information.

    Args:
        query: The search query string.
    """
    # Stub implementation — replace with a real search API (Tavily, SerpAPI, etc.)
    return f"Search results for '{query}': No results found. (Replace this stub with a real search API)"


TOOLS = [get_weather, search_web]
