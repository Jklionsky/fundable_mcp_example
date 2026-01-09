import { config } from "dotenv";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Load environment variables
config();

async function testConnection() {
  const serverUrl = process.env.MCP_SERVER_URL;
  const apiKey = process.env.MCP_API_KEY; // Optional: API key for programmatic access

  if (!serverUrl) {
    console.error("❌ MCP_SERVER_URL not set in .env file");
    process.exit(1);
  }

  console.log("🔄 Testing MCP connection...\n");
  console.log(`Server URL: ${serverUrl}`);
  if (apiKey) {
    console.log(`Auth: API Key`);
  } else {
    console.log(`Auth: OAuth (may open browser)`);
  }
  console.log();

  let client;

  try {
    // Build mcp-remote args - optionally include API key header
    const mcpArgs = ["mcp-remote", serverUrl];
    if (apiKey) {
      mcpArgs.push("--header", `Authorization: Bearer ${apiKey}`);
    }

    // Connect to the server using AI SDK MCP client
    console.log("Connecting to MCP server...");
    client = await createMCPClient({
      transport: new StdioClientTransport({
        command: "npx",
        args: mcpArgs,
      }),
    });

    // Get available tools
    const tools = await client.tools();
    const toolNames = Object.keys(tools);
    console.log(`\n📋 Available Tools (${toolNames.length}):\n`);

    for (const name of toolNames) {
      console.log(`  • ${name}`);
      console.log(`    Description: ${tools[name].description || 'No description'}`);
      console.log();
    }

    console.log("\n✓ Connection test successful!");

  } catch (error) {
    console.error("\n❌ Connection test failed:", error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testConnection();
