# MCP AI Agent Example - Fundable VC Dataset

Example implementation of an AI agent using **Vercel AI SDK** integrated with the **Fundable MCP server**. This repository demonstrates the power of MCP with minimal code modifications and relatively simple prompting.

## Overview

This project demonstrates how to build a command-line AI agent that connects to the Fundable MCP server to query a comprehensive VC dataset (companies, investors, people, funding rounds) using natural language.

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
OPENAI_MODEL=gpt-4o  # Optional

# ANTHROPIC_API_KEY=sk-ant-your-api-key-here
# ANTHROPIC_MODEL=claude-sonnet-4-20250514

# GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
# GOOGLE_MODEL=gemini-2.5-flash
```

**Provider Priority:** Anthropic → OpenAI → Google (uses first available)

### Running the Agent

```bash
# Test MCP server connection
npm run test:connection

# Run interactive CLI
npm run dev

# Build for production
npm run build && npm start
```

## Repository Structure

```
mcp-ai-agent-example/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── agent.ts              # AIAgent class (Vercel AI SDK + MCP)
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

# Evaluation tests (measure agent quality)
npm run test:eval              # All suites (easy + medium + hard)
npm run test:eval:simple       # Easy suite only
npm run test:eval:medium       # Medium suite only
npm run test:eval:hard         # Hard suite only

# Run specific test
npx tsx tests/test-runner.ts --suite=easy --id=5
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
