# MCP AI Agent Example - Fundable VC Dataset

## Overview

This project demonstrates how to build a command-line AI agent using Vercel's AI SDK that connects to the Fundable MCP server to query a comprehensive VC dataset (companies, investors, people, funding rounds) using natural language.

**Key Purpose:** This is intentionally a straightforward example showing what you can accomplish with MCP without complex prompting or extensive code modifications. The simplicity demonstrates MCP's power - **downstream users should add more advanced prompting techniques for production use** (see Production Considerations below).

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

# Reccomend using openai model for highest accuracy + tool call efficiency. Gemini flash models tend to offer best combination of speed + accuracy.
```

### Running the Agent

```bash
# Test MCP server connection
npm run test:connection

# Run interactive CLI (auto-detects provider)
npm run dev

# Run with specific provider
npm start -- --provider openai
npm start -- --provider anthropic
npm start -- --provider google

# Run with verbose logging
npm start -- --verbose
npm start -- -v

# Combine options
npm start -- --provider openai --verbose

# Show all available options
npm start -- --help

# Build for production
npm run build && npm start
```

### CLI Options

The agent supports the following command-line options:

- **`-p, --provider <name>`** - Specify AI provider: `openai`, `anthropic`, or `google`
  - Default: Auto-detect based on available API keys (priority: Google → OpenAI → Anthropic)
- **`-v, --verbose`** - Enable verbose logging to see tool calls and reasoning
  - Default: `false`
- **`-h, --help`** - Show help message with usage examples

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

The Fundable MCP server exposes **4 tools** for querying venture capital data from BigQuery:

### 1. getDatasetContext
**Purpose:** Get complete dataset documentation before querying

**Why use it:** Should **always be called at the beginning** of a session. Provides:
- Full table schemas with column types (DBML format)
- Business rules (e.g., all monetary values are in MILLIONS)
- Optimal join patterns and relationships
- 20+ copy-paste example queries
- Common pitfalls and validation tips

Without this context, you'll likely use wrong table names, forget value formats, or miss critical join patterns.

### 2. listDatasetTables
**Purpose:** Quick overview of available tables

### 3. getTableDetails
**Purpose:** Get schema details for a specific table

**Parameters:**
- `tableName` (string): Table to inspect

**Returns:** Column names, types, and constraints for that table

### 4. queryVCData ⭐
**Purpose:** Execute read-only BigQuery SQL queries (the core query tool)

**Parameters:**
- `sql` (string): SQL query to execute
- `maxResults` (number, optional, max 10,000): Result limit

**How it works:**
1. Validates query (blocks writes, checks table/column names, detects dangerous patterns)
2. Executes query via BigQuery REST API with service account credentials
3. Returns results as JSON with execution statistics (bytes processed, execution time)

**Security:** All write operations (INSERT, UPDATE, DELETE, DROP) are blocked. SQL injection protection included.

## Usage Examples

### Interactive CLI

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

### Available Commands

- **Natural questions** - Ask about companies, investors, funding rounds, etc.
- **`clear`** - Reset conversation history
- **`exit`** or **`quit`** - Exit the CLI

## Testing & Evaluation

### Running Tests

```bash
# Connection test
npm run test:connection

# Run specific test
npx run test:eval --suite=easy --id=5

# Run with specific AI provider
npx test:eval --suite=medium --provider=openai

# Combine options
npx tsx tests/test-runner.ts --suite=hard --id=5 --provider=google
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
