# MCP AI Agent Example - Fundable VC Dataset

## Overview

This project demonstrates how to build a command-line AI agent using Vercel's AI SDK that connects to the Fundable MCP server to query a comprehensive VC dataset (companies, investors, people, funding rounds) using natural language.

**Key Purpose:** This is intentionally a straightforward example showing what you can accomplish with MCP without complex prompting or extensive code modifications. The simplicity demonstrates MCP's power - **downstream users should add more advanced prompting techniques for production use** (see Production Considerations below).

## Table of Contents

- [Quick Start](#quick-start)
- [Production Considerations](#️-production-considerations)
- [Prerequisites & Setup](#prerequisites--setup)
- [Running the Agent](#running-the-agent)
- [Usage Examples](#usage-examples)
- [Repository Structure](#repository-structure)
- [About the Fundable MCP](#about-the-fundable-mcp)
- [Testing & Evaluation](#testing--evaluation)
- [License](#license)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API key

# 3. Get allowlisted (required)
# Contact jacob@tryfundable.ai with your GitHub username

# 4. Test connection
npm run test:connection

# 5. Start the agent
npm run dev
```

## ⚠️ Production Considerations

This example uses relatively simple prompting to demonstrate MCP's core capabilities. **For production use, you should implement more advanced prompting techniques:**

**Prompting Enhancements:**
- **Return format specificity:** Add prompting for exact output schemas (JSON schema, markdown tables, structured data)
- **Discovery questions:** Implement disambiguation flows (e.g., "a16z" could mean a16z crypto, a16z speedrun, or a16z main fund)

**Additional Considerations:**
- Error handling for failed queries and API timeouts
- Rate limiting and query throttling
- Conversation persistence/resumption
- Structured logging and cost monitoring

## Prerequisites & Setup

### Prerequisites

- **Node.js 18+** required
- **GitHub account** for authentication
  - **Important:** Contact `jacob@tryfundable.ai` with your GitHub username to be allowlisted for MCP server access
- **API key** for at least one AI provider (OpenAI, Anthropic, or Google)

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your configuration (see below)
```

### Environment Configuration

Edit your `.env` file:

```bash
# MCP Server URL
MCP_SERVER_URL=https://fundable_mcp.jacob-57a.workers.dev/mcp

# AI Provider (choose one - comment out unused providers)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-5-mini  # Optional

# GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
# GOOGLE_MODEL=gemini-3-flash

# ANTHROPIC_API_KEY=sk-your-api-key-here
# ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

# Recommend using openai model for highest accuracy + tool call efficiency. Gemini flash models tend to offer best combination of speed + accuracy.
```

## Running the Agent

### CLI Options

The agent supports the following command-line options:

- **`--provider=<name>`** - Specify AI provider: `openai`, `anthropic`, or `google`
  - Default: Auto-detect based on available API keys (priority: Google → OpenAI → Anthropic)
  - Specific models utilized are defined in env variables
- **`-v, --verbose`** - Enable verbose logging to see tool calls and reasoning
  - Default: `false`
- **`-h, --help`** - Show help message with usage examples

### Example CLI commands

```bash
# Test MCP server connection
npm run test:connection

# Run interactive CLI (auto-detects provider)
npm run dev

# Run with specific provider
npm run dev -- --provider=openai
npm run dev -- --provider=anthropic
npm run dev -- --provider=google

# Run with verbose logging of tool calls and results
npm run dev -- -v

# Combine options
npm run dev -- --provider=openai -v

# Show all available options
npm run dev -- --help

# Build for production
npm run build
```

### Available Text Commands

- **Natural questions** - Ask about companies, investors, funding rounds, etc.
- **`clear`** - Reset conversation history
- **`exit`** or **`quit`** - Exit the CLI

## Usage Examples

```bash
npm run dev
```

Once running, interact with the VC dataset using natural language:

```
You: What tables are available?
Agent: [calls getDatasetContext] The database contains tables for organizations,
deals, institutional_investments, people, and more...

You: Who are the top investors in fintech companies?
Agent: [calls queryVCData] Based on the data, the top fintech investors are...

You: Clear
Agent: Conversation history cleared.

You: Exit
Agent: Goodbye!
```

## Repository Structure

```
mcp-ai-agent-example/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── agent.ts              # AIAgent class (Vercel AI SDK + MCP)
│   ├── helpers.ts            # CLI argument parsing & model selection
│   ├── prompt-loader.ts      # Prompt management system
│   └── test-connection.ts    # MCP connection test utility
├── tests/
│   ├── test-runner.ts        # Test orchestration engine
│   ├── test-suite/           # Test cases by difficulty
│   └── helpers/              # LLM-based evaluation system
├── prompts.yaml              # ⭐ Agent system prompts
└── .env.example              # Environment template
```

**Key Files:**
- **`prompts.yaml`**: Agent behavior, query budgets, reasoning approach
- **`src/agent.ts`**: Vercel AI SDK + MCP integration
- **`src/helpers.ts`**: CLI argument parsing and AI provider configuration
- **`tests/test-runner.ts`**: Agent quality evaluation framework

## About the Fundable MCP

The Fundable MCP server exposes **5 tools** for querying venture capital data from BigQuery:

| Tool | Purpose | Params |
|------|---------|--------|
| **getDatasetContext** | **Call at session start.** Returns complete dataset documentation: table schemas (DBML), business rules (monetary values in MILLIONS), and join patterns. | None |
| **listDatasetTables** | Quick overview of all available tables in the dataset. | None |
| **getQueryExamples** | Access 20+ example queries by category. Useful when unsure how to structure a query or after failed attempts. | `category`: Query category (e.g., "Funding Analysis", "People & Relationships") |
| **getTableDetails** | Get column names, types, and constraints for a specific table. | `tableName`: Table to inspect |
| **queryVCData** ⭐ | Execute read-only BigQuery SQL. Validates queries (blocks writes, checks tables/columns), executes via BigQuery REST API, returns JSON results with stats. | `sql`: SQL query<br>`maxResults`: Result limit (optional, max 10,000) |

## Testing & Evaluation

### Running Tests

```bash
# Connection test
npm run test:connection

# Run all test suites
npm run test:eval

# Run specific suite
npm run test:eval -- --suite=easy

# Run specific test
npm run test:eval -- --suite=easy --id=5

# Run with specific AI provider
npm run test:eval -- --suite=medium --provider=openai

# Combine options
npm run test:eval -- --suite=hard --provider=google
```

### Test Framework

**Three difficulty levels:**
- **Easy**: Simple lookups, basic queries
- **Medium**: Multi-step discovery, aggregations
- **Hard**: Complex joins, entity disambiguation

**LLM-as-Judge Evaluation** (`holistic-evaluator.ts`):
1. **Logical Approach** - Does the query strategy make sense?
2. **Answer Correctness** - Is the answer accurate?
3. **Efficiency** - Within expected query budget (+2 tolerance)?

**Results:** Stored in `tests/results/` as timestamped JSON with pass/fail grades, reasoning, and full traces.

## License

MIT
