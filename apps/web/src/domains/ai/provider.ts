import "server-only";

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema (formato usado tanto pela API da Anthropic quanto por qualquer provider futuro). */
  inputSchema: Record<string, unknown>;
}

export interface AITextBlock {
  type: "text";
  text: string;
}

export interface AIToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AIContentBlock = AITextBlock | AIToolUseBlock;

export interface AIToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type AIMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: AIContentBlock[] }
  | { role: "user_tool_results"; results: AIToolResult[] };

export interface AIChatParams {
  system: string;
  messages: AIMessage[];
  tools: AIToolDefinition[];
  model: string;
  maxTokens: number;
}

export interface AIChatResult {
  content: AIContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  readonly code: string;
  readonly isDev: boolean;
  chat(params: AIChatParams): Promise<AIChatResult>;
}
