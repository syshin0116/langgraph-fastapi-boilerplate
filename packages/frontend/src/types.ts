import type { Message } from "@langchain/langgraph-sdk";

export interface GraphState {
  messages: Message[];
}
