import { config } from "dotenv";
import * as readline from "readline";
import { AIAgent } from "./agent.js";
import { getPrompt } from "./prompt-loader.js";
import { parseArgs, getModel } from "./helpers.js";

// Load environment variables
config();

/**
 * Main CLI interface for the AI agent
 */
async function main() {
  // Parse command-line arguments
  const cliOptions = parseArgs();
  // Validate environment variables
  const mcpServerUrl = process.env.MCP_SERVER_URL;
  const mcpApiKey = process.env.MCP_API_KEY; // Optional: API key for programmatic access

  if (!mcpServerUrl) {
    console.error("❌ MCP_SERVER_URL not set in .env file");
    process.exit(1);
  }

  // Get the AI model based on CLI options or auto-detection
  const { model, modelName } = getModel(cliOptions.provider);

  // Print welcome banner
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║          🤖 AI Agent with Fundable MCP Integration 🤖       ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`📡 MCP Server: ${mcpServerUrl}`);
  console.log(`🧠 AI Model: ${modelName}`);
  console.log();

  // Initialize agent
  const agent = new AIAgent({
    mcpServerUrl,
    apiKey: mcpApiKey, // Optional: bypasses OAuth when set
    model,
    maxSteps: 10,
    verbose: cliOptions.verbose
  });

  try {
    // Initialize with custom configuration
     // Load system prompt from centralized configuration with test mode suffix
    const systemPrompt = getPrompt('vc_analyst') + '\n' + getPrompt('conversation_suffix');

    await agent.initialize({
      systemPrompt: systemPrompt
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
    console.log("  • Try: 'Who is the founder of ramp.com?'");
    console.log("  • Try: 'What deals happened this week?'");
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
