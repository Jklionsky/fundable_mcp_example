/**
 * Type definitions for MCP tools and responses
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
    isError?: boolean;
  }>;
}

export interface AgentConfig {
  mcpServerUrl: string;
  openaiApiKey: string;
  model?: string;
}
