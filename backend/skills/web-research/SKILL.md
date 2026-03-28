---
name: web-research
description: "Conducts web searches to find information. Use when the user needs factual information, recent events, or general knowledge that requires external lookup."
---

# Web Research Skill

## When to Use
- User asks for factual information not in your training data
- User needs to find specific data or recent events
- User asks questions requiring external knowledge

## Workflow
1. Formulate a clear, specific search query from the user's question
2. Use the `search_web` tool to find information
3. Synthesize results into a clear, concise answer
4. If results are insufficient, refine the query and search again

## Response Guidelines
- Provide direct answers, not just search result summaries
- Cite sources when available
- Acknowledge if information could not be found
- Suggest alternative search terms if initial results are poor
