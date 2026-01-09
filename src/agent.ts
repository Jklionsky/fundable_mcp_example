import { Experimental_Agent as Agent, LanguageModel, stepCountIs, CoreMessage } from "ai";
import { experimental_createMCPClient as createMCPClient, type experimental_MCPClient as MCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getPrompt } from "./prompt-loader.js";
import { detectProvider, getProviderCacheOptions, AIProvider, TOKEN_OPTIMIZATION } from "./helpers.js";

/**
 * AI Agent wrapper that integrates Vercel's Agent class with MCP tools
 *
 * Supports OpenAI, Google (Gemini), and other AI SDK providers
 */

export class AIAgent {
  private mcpClient: MCPClient | null = null;
  private agent: Agent<any> | null = null;
  private model: LanguageModel;
  private mcpServerUrl: string;
  private apiKey: string | undefined; // Optional API key for auth (bypasses OAuth)
  private messages: CoreMessage[] = []; // Store conversation history
  private trace: Array<Array<{toolName: string, input: any, output: any, stepNumber: number}>> = []; // Store tool call traces
  private verbose: boolean;
  private provider: AIProvider; // Track provider for caching optimizations

  constructor(config: {
    mcpServerUrl: string;
    model: LanguageModel;
    apiKey?: string; // Optional: API key for programmatic access (bypasses OAuth browser flow)
    systemPrompt?: string;
    maxSteps?: number;
    verbose?: boolean;
  }) {
    this.mcpServerUrl = config.mcpServerUrl;
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.verbose = config.verbose ?? false; // Default to true for backward compatibility
    this.provider = detectProvider(config.model);
  }

  /**
   * Initialize the agent and connect to MCP server
   */
  async initialize(config?: {
    systemPrompt?: string;
    maxSteps?: number;
  }): Promise<void> {
    console.log("🤖 Initializing AI Agent...\n");
    console.log(`📡 Connecting to MCP server at ${this.mcpServerUrl}...`);
    if (this.apiKey) {
      console.log(`🔑 Using API key authentication`);
    } else {
      console.log(`🔐 Using OAuth authentication (may open browser)`);
    }

    // Build mcp-remote args - optionally include API key header
    const mcpArgs = ["mcp-remote", this.mcpServerUrl];
    if (this.apiKey) {
      mcpArgs.push("--header", `Authorization: Bearer ${this.apiKey}`);
    }

    // Create MCP client using stdio transport with mcp-remote
    // This allows us to connect to remote MCP servers with OAuth or API key authentication
    this.mcpClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: "npx",
        args: mcpArgs,
      }),
    });

    // Get tools from MCP client - this automatically converts them to AI SDK format
    const tools = await this.mcpClient.tools();

    // Create Vercel Agent with MCP tools
    this.agent = new Agent({
      model: this.model,
      system: config?.systemPrompt || getPrompt('default'),
      tools,
      stopWhen: stepCountIs(config?.maxSteps || 15), // Allow multiple tool calls in sequence
    });

    console.log("✓ Connected to MCP server");
    console.log("✓ Agent configured with MCP tools");
    console.log("\n✓ Agent ready!\n");
  }

  /**
   * Send a message to the agent and get a response
   * Maintains conversation history across multiple calls
   */
  async chat(userMessage: string): Promise<string> {
    if (!this.agent) {
      throw new Error("Agent not initialized. Call initialize() first.");
    }

    try {
      // Add user message to conversation history
      this.messages.push({
        role: "user",
        content: userMessage,
      });

      // Apply provider-specific caching options (e.g., Anthropic prompt caching, not available for others)
      const cacheOptions = getProviderCacheOptions(this.provider);
      
      // Generate response with full conversation history
      const result = await this.agent.generate({
        messages: this.messages,
        ...cacheOptions,
      });

      // Capture trace data for this conversation turn -- for debugging of agent tool calls
      const currentTrace: Array<{toolName: string, input: any, output: any, stepNumber: number}> = [];
      if (result.steps && result.steps.length > 0) {
        const toolCalls = result.steps.filter((step: any) => step.toolCalls && step.toolCalls.length > 0);
        toolCalls.forEach((step: any, stepIndex: number) => {
          step.toolCalls.forEach((call: any, callIndex: number) => {
            // Extract input and output from the tool result
            const toolResult = step.toolResults?.[callIndex];
            const toolData = {
              toolName: call.toolName,
              input: toolResult?.input || call.args,  // Prefer toolResult.input, fallback to call.args
              output: toolResult?.output || null,     // Extract just the output, not the wrapper
              stepNumber: stepIndex + 1
            };
            currentTrace.push(toolData);
          });
        });
      }
      this.trace.push(currentTrace);
      // Log tool usage information if verbose mode is enabled
      if (this.verbose) {
        this.logToolUsage(result);
      }

      // Add response messages to conversation history
      // result.response.messages contains properly formatted messages including:
      // - Assistant messages with tool calls
      // - Tool messages with results
      // - Final assistant response
      this.messages.push(...result.response.messages);

      // Truncate large tool results to reduce token usage in subsequent requests
      this.truncateHistory();

      return result.text;
    } catch (error) {
      console.error("\n❌ Error generating response:", error);
      throw error;
    }
  }
  

  /**
   * Log tool usage information to console
   * Only called when verbose mode is enabled
   */
  private logToolUsage(result: any): void {
    if (result.steps && result.steps.length > 0) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🔧 Tool Usage Summary:`);
      console.log(`   Total steps: ${result.steps.length}`);
      console.log(`${"=".repeat(60)}`);

      const toolCalls = result.steps.filter((step: any) => step.toolCalls && step.toolCalls.length > 0);
      if (toolCalls.length > 0) {
        toolCalls.forEach((step: any, stepIndex: number) => {
          step.toolCalls.forEach((call: any, callIndex: number) => {
            const toolNumber = stepIndex + 1;
            console.log(`\n📍 Tool Call #${toolNumber}:`);
            console.log(`   🔨 Tool Name: ${call.toolName}`);
            // Log tool arguments (queries)
            if (call.args && Object.keys(call.args).length > 0) {
              console.log(`\n   📝 Query/Arguments:`);
              const argsStr = JSON.stringify(call.args, null, 2);
              argsStr.split('\n').forEach(line => {
                console.log(`      ${line}`);
              });
            }
            // Log tool results (responses)
            if (step.toolResults && step.toolResults[callIndex]) {
              const result = step.toolResults[callIndex];
              console.log(`\n   ✅ Response:`);
              // Try to pretty print if it's JSON, otherwise show as-is
              try {
                let resultContent = result.result || result.content || result;

                // If it's an object, stringify it nicely
                if (typeof resultContent === 'object') {
                  const resultStr = JSON.stringify(resultContent, null, 2);
                  // Limit very long responses
                  if (resultStr.length > 5000) {
                    resultStr.substring(0, 5000).split('\n').forEach(line => {
                      console.log(`      ${line}`);
                    });
                    console.log(`      ... (truncated, ${resultStr.length - 5000} more characters)`);
                  } else {
                    resultStr.split('\n').forEach(line => {
                      console.log(`      ${line}`);
                    });
                  }
                } else {
                  // String content
                  const resultStr = String(resultContent);
                  if (resultStr.length > 5000) {
                    console.log(`      ${resultStr.substring(0, 5000)}...`);
                    console.log(`      ... (truncated, ${resultStr.length - 5000} more characters)`);
                  } else {
                    resultStr.split('\n').forEach(line => {
                      console.log(`      ${line}`);
                    });
                  }
                }
              } catch (e) {
                // Fallback if parsing fails
                console.log(`      ${JSON.stringify(result)}`);
              }
            }
            console.log(`\n   ${"─".repeat(56)}`);
          });
        });
      }
      console.log(`\n${"=".repeat(60)}\n`);
    }
  }

  /**
   * Truncate large tool results in message history to reduce token usage
   * Only truncates results from query tools (queryVCData), not context/schema tools
   * Note: We intentionally do NOT limit message count - that breaks tool call/response pairs
   */
  private truncateHistory(): void {
    const { MAX_TOOL_RESULT_LENGTH, TRUNCATION_SUFFIX, TOOLS_TO_TRUNCATE } = TOKEN_OPTIMIZATION;

    // Helper to truncate a string if too long
    const truncateString = (str: string): string => {
      if (str.length > MAX_TOOL_RESULT_LENGTH) {
        return str.slice(0, MAX_TOOL_RESULT_LENGTH) + TRUNCATION_SUFFIX;
      }
      return str;
    };

    // Recursively truncate string values in any object/array structure
    const truncateDeep = (obj: any): any => {
      if (typeof obj === 'string') {
        return truncateString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(truncateDeep);
      }
      if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const key of Object.keys(obj)) {
          result[key] = truncateDeep(obj[key]);
        }
        return result;
      }
      return obj;
    };

    // Truncate only query tool results, preserve context/schema tools
    this.messages = this.messages.map(msg => {
      // Only process tool messages
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        const truncatedContent = msg.content.map((part: any) => {
          // Check if this tool result should be truncated
          const toolName = part.toolName || '';
          if (TOOLS_TO_TRUNCATE.has(toolName)) {
            // Truncate the result content
            return { ...part, result: truncateDeep(part.result) };
          }
          // Preserve context/schema tool results untouched
          return part;
        });
        return { ...msg, content: truncatedContent };
      }
      return msg;
    }) as CoreMessage[];
  }

  /**
   * Clear conversation history and trace
   * Useful for starting a fresh conversation without reconnecting
   */
  clearHistory(): void {
    this.messages = [];
    this.trace = [];
    console.log("\n🗑️  Conversation history and trace cleared");
  }

  /**
   * Get current conversation history
   */
  getHistory(): CoreMessage[] {
    return [...this.messages]; // Return a copy
  }

  /**
   * Get complete trace of all tool calls across all conversation turns
   */
  getTrace(): Array<Array<{toolName: string, input: any, output: any, stepNumber: number}>> {
    return [...this.trace]; // Return a copy
  }

  /**
   * Get trace for the most recent conversation turn
   */
  getLastTrace(): Array<{toolName: string, input: any, output: any, stepNumber: number}> {
    if (this.trace.length === 0) {
      return [];
    }
    return [...this.trace[this.trace.length - 1]]; // Return a copy
  }

  /**
   * Clear only the trace (keep conversation history)
   */
  clearTrace(): void {
    this.trace = [];
    console.log("\n🗑️  Trace cleared");
  }

  /**
   * Cleanup and disconnect
   */
  async close(): Promise<void> {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
    this.agent = null;
    console.log("\n👋 Agent disconnected");
  }
}
