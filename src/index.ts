import { config } from "dotenv";
import * as readline from "readline";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { AIAgent } from "./agent.js";
import { getPrompt } from "./prompt-loader.js";

// Load environment variables
config();

/**
 * Main CLI interface for the AI agent
 */
async function main() {
  // Validate environment variables
  const mcpServerUrl = process.env.MCP_SERVER_URL;

  if (!mcpServerUrl) {
    console.error("❌ MCP_SERVER_URL not set in .env file");
    process.exit(1);
  }

  // Determine which AI provider to use
  // Priority: Anthropic (Claude) > OpenAI > Google
  let model;
  let modelName = "Unknown";

  if (process.env.ANTHROPIC_API_KEY) {
    // Use Claude (Anthropic)
    const modelId = process.env.ANTHROPIC_MODEL || "claude-sonnet-4";
    model = anthropic(modelId);
    modelName = `Claude (${modelId})`;
  } else if (process.env.OPENAI_API_KEY) {
    // Use OpenAI
    const modelId = process.env.OPENAI_MODEL || "gpt-4o";
    model = openai(modelId);
    modelName = `OpenAI (${modelId})`;
  } else if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    // Use Google (Gemini)
    const modelId = process.env.GOOGLE_MODEL || "gemini-2.0-flash-exp";
    model = google(modelId);
    modelName = `Google (${modelId})`;
  } else {
    console.error("❌ No API key found. Set either ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in .env file");
    process.exit(1);
  }

  // Print welcome banner
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║          🤖 AI Agent with MCP Integration 🤖               ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`📡 MCP Server: ${mcpServerUrl}`);
  console.log(`🧠 AI Model: ${modelName}`);
  console.log();

  // Initialize agent
  const agent = new AIAgent({
    mcpServerUrl,
    model,
    maxSteps: 15,
    verbose: true
  });

  try {
    // Initialize with custom configuration
    await agent.initialize({
      systemPrompt: getPrompt('vc_analyst')
    });

    // Setup readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "\n💬 You: ",
    });

    console.log("════════════════════════════════════════════════════════════");
    console.log();
    console.log("You can now chat with the AI agent!");
    console.log("The agent has access to your database tools via MCP.");
    console.log();
    console.log("Tips:");
    console.log("  • Try: 'What tables are available?'");
    console.log("  • Try: 'Show me recent VC investments'");
    console.log("  • Type 'clear' to reset conversation history");
    console.log("  • Type 'exit' to quit");
    console.log();
    console.log("════════════════════════════════════════════════════════════");

    rl.prompt();

    rl.on("line", async (input) => {
      const userInput = input.trim();

      if (!userInput) {
        rl.prompt();
        return;
      }

      // Handle exit command
      if (userInput.toLowerCase() === "exit" || userInput.toLowerCase() === "quit") {
        console.log("\n👋 Goodbye!");
        await agent.close();
        rl.close();
        process.exit(0);
      }

      // Handle clear command
      if (userInput.toLowerCase() === "clear") {
        agent.clearHistory();
        rl.prompt();
        return;
      }

      try {
        // Get agent response
        const response = await agent.chat(userInput);
        // Display response
        console.log(`\n🤖 Agent: ${response}`);
      } catch (error) {
        console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
      }

      rl.prompt();
    });

    rl.on("close", async () => {
      console.log("\n👋 Goodbye!");
      await agent.close();
      process.exit(0);
    });

    // Handle Ctrl+C
    process.on("SIGINT", async () => {
      console.log("\n\n👋 Goodbye!");
      await agent.close();
      rl.close();
      process.exit(0);
    });
  } catch (error) {
    console.error("\n❌ Failed to initialize agent:", error);
    process.exit(1);
  }
}

main();
