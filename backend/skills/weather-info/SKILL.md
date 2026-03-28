---
name: weather-info
description: "Provides weather information for cities. Use when the user asks about weather, temperature, or climate conditions for a specific location."
---

# Weather Information Skill

## When to Use
- User asks about current weather in a city
- User needs temperature or climate information
- User is planning travel and wants weather conditions

## Workflow
1. Identify the city from the user's message
2. Use the `get_weather` tool with the city name
3. Present the weather data clearly
4. Offer to check weather for additional cities if relevant

## Response Guidelines
- Always include the city name and temperature
- If the user asks about multiple cities, check each one separately
- Use natural language to describe conditions (e.g., "It's a warm sunny day" rather than just raw data)
