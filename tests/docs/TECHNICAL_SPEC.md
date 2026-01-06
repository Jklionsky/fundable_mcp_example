# AI Agent Evaluation Framework - Technical Specification

**Version:** 1.0
**Last Updated:** 2024-12-18
**Status:** Design Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Component Specifications](#component-specifications)
4. [Data Structures](#data-structures)
5. [Implementation Plan](#implementation-plan)
6. [Testing Strategy](#testing-strategy)

---

## Overview

### Purpose

Automated evaluation framework to test AI agent performance on VC dataset queries. The framework validates:
- Query path correctness (did agent follow expected approach)
- Tool call efficiency (stayed within allowed tool calls)
- Table coverage (touched expected database tables)
- Answer accuracy (LLM-evaluated response quality)

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent Instrumentation | Wrapper class around AIAgent | Non-invasive, preserves original agent behavior |
| SQL Table Extraction | Regex-based parsing | Simple, works well (proven in validation.ts) |
| LLM Evaluation | Model-agnostic (currently GPT) | Flexibility, already integrated in project |
| Execution Mode | Sequential | Easier to debug, avoid rate limits |
| Context Tool Filtering | Exclude from tool count | These are preparatory, not "work" |

### Context Tools (Excluded from Count)

These tools are for agent preparation and don't count toward max_tool_calls:
- `getDatasetContext` - Loads schema and examples
- `listDatasetTables` - Quick table listing
- `getTableDetails` - Schema lookup

### Work Tools (Counted)

These tools perform actual query work:
- `queryVCData` - Execute BigQuery SQL

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│  Test Runner    │
│  (cli.ts)       │
└────────┬────────┘
         │
         ├─────► Read test-cases.json
         │
         ▼
┌─────────────────────────────────┐
│  Test Executor                  │
│  (test-runner.ts)               │
│                                 │
│  For each test case:            │
│  1. Create instrumented agent   │
│  2. Send question               │
│  3. Capture execution trace     │
│  4. Extract tables from SQL     │
│  5. Run LLM evaluations         │
│  6. Save results                │
└─────────────────────────────────┘
         │
         ├─────► InstrumentedAgent (agent-tracker.ts)
         │       └── Wraps AIAgent with hooks
         │
         ├─────► SQLTableExtractor (sql-parser.ts)
         │       └── Regex-based table extraction
         │
         ├─────► PathEvaluator (evaluators.ts)
         │       └── LLM evaluates approach
         │
         ├─────► AnswerEvaluator (evaluators.ts)
         │       └── LLM evaluates accuracy
         │
         └─────► ResultWriter (result-writer.ts)
                 └── Save to tests/results/
```

### File Structure

```
mcp-ai-agent-example/
├── src/
│   ├── agent.ts                 # Original AIAgent (unchanged)
│   └── index.ts                 # CLI interface (reference)
│
├── tests/
│   ├── test-cases.json          # ✅ Test definitions (done)
│   ├── types.ts                 # ✅ TypeScript interfaces (exists)
│   ├── README.md                # ✅ Documentation (exists)
│   │
│   ├── TECHNICAL_SPEC.md        # 📄 This document
│   │
│   ├── agent-tracker.ts         # 🔨 Instrumented agent wrapper
│   ├── sql-parser.ts            # 🔨 SQL table extraction
│   ├── evaluators.ts            # 🔨 LLM-based evaluations
│   ├── test-runner.ts           # 🔨 Main orchestrator
│   ├── result-writer.ts         # 🔨 Save results to files
│   ├── cli.ts                   # 🔨 CLI entry point
│   │
│   └── results/                 # Test run outputs
│       ├── latest.json          # Symlink to most recent
│       └── run-2024-12-18-15-30-00.json
│
└── package.json                 # Add scripts: test:eval, test:eval:watch
```

**Legend:**
- ✅ Already exists
- 📄 This spec
- 🔨 To be implemented

---

## Component Specifications

### 1. InstrumentedAgent (agent-tracker.ts)

**Purpose:** Wrapper around AIAgent that captures execution trace without modifying original agent.

#### Class Design

```typescript
import { AIAgent } from '../src/agent.js';
import { CoreMessage } from 'ai';

/**
 * Tool call record
 */
interface ToolCallRecord {
  toolName: string;
  parameters: any;
  timestamp: string;
  success: boolean;
  error?: string;
  result?: any;
}

/**
 * Execution trace captured during test
 */
interface ExecutionTrace {
  toolCalls: ToolCallRecord[];
  contextToolCalls: ToolCallRecord[];  // Separated for clarity
  workToolCalls: ToolCallRecord[];     // Only these count
  sqlQueries: string[];                // Extracted from queryVCData calls
  finalAnswer: string;
  errors: string[];
  totalToolCalls: number;              // workToolCalls.length
}

/**
 * Instrumented agent that tracks execution
 */
export class InstrumentedAgent {
  private agent: AIAgent;
  private trace: ExecutionTrace;
  private contextTools = new Set(['getDatasetContext', 'listDatasetTables', 'getTableDetails']);

  constructor(config: {
    mcpServerUrl: string;
    model: any;
    maxSteps?: number;
  }) {
    this.agent = new AIAgent(config);
    this.resetTrace();
  }

  /**
   * Initialize agent with system prompt
   */
  async initialize(options?: { systemPrompt?: string }): Promise<void> {
    await this.agent.initialize(options);
  }

  /**
   * Send message and track execution
   */
  async chat(message: string): Promise<string> {
    // Hook into agent's tool execution
    const originalChat = this.agent.chat.bind(this.agent);

    // Intercept tool calls by wrapping the agent's internal methods
    // This is where we capture the trace

    const response = await this.executeWithTracking(message);
    return response;
  }

  /**
   * Execute chat with tracking enabled
   */
  private async executeWithTracking(message: string): Promise<string> {
    // Implementation will hook into streamText's onToolCall
    // See detailed implementation below
  }

  /**
   * Get execution trace
   */
  getTrace(): ExecutionTrace {
    return { ...this.trace };
  }

  /**
   * Reset trace for new test
   */
  resetTrace(): void {
    this.trace = {
      toolCalls: [],
      contextToolCalls: [],
      workToolCalls: [],
      sqlQueries: [],
      finalAnswer: '',
      errors: [],
      totalToolCalls: 0
    };
  }

  /**
   * Close agent connection
   */
  async close(): Promise<void> {
    await this.agent.close();
  }
}
```

#### Implementation Strategy

**Hooking Approach:** Wrap the `agent.chat()` method and intercept tool execution.

The AIAgent uses `streamText` from Vercel AI SDK, which provides lifecycle hooks:
- `onToolCall` - Called when tool is invoked
- `onToolResult` - Called when tool completes

We'll leverage these to build our trace.

**Key Implementation Details:**

```typescript
private async executeWithTracking(message: string): Promise<string> {
  // We need to access the agent's internal streamText call
  // Since AIAgent.chat() already handles this, we'll need to either:
  // Option A: Extend AIAgent class
  // Option B: Monkey-patch the MCP client's callTool method
  // Option C: Wrap at a higher level using message interception

  // RECOMMENDED: Option C - Message interception
  // Store original messages, call agent.chat(), inspect final messages

  const startingMessageCount = this.agent.getMessageHistory().length;

  try {
    const response = await this.agent.chat(message);
    this.trace.finalAnswer = response;

    // Extract tool calls from message history
    const messages = this.agent.getMessageHistory();
    const newMessages = messages.slice(startingMessageCount);

    // Parse tool calls from messages
    for (const msg of newMessages) {
      if (msg.role === 'assistant' && msg.toolInvocations) {
        for (const invocation of msg.toolInvocations) {
          this.recordToolCall({
            toolName: invocation.toolName,
            parameters: invocation.args,
            timestamp: new Date().toISOString(),
            success: invocation.state === 'result',
            result: invocation.result,
            error: invocation.state === 'error' ? String(invocation.result) : undefined
          });
        }
      }
    }

    return response;
  } catch (error) {
    this.trace.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

private recordToolCall(record: ToolCallRecord): void {
  this.trace.toolCalls.push(record);

  // Categorize as context or work tool
  if (this.contextTools.has(record.toolName)) {
    this.trace.contextToolCalls.push(record);
  } else {
    this.trace.workToolCalls.push(record);
    this.trace.totalToolCalls++;

    // Extract SQL if queryVCData
    if (record.toolName === 'queryVCData' && record.parameters?.sql) {
      this.trace.sqlQueries.push(record.parameters.sql);
    }
  }
}
```

---

### 2. SQLTableExtractor (sql-parser.ts)

**Purpose:** Extract table names from SQL queries using regex patterns.

#### Implementation

```typescript
/**
 * Extract table names from SQL query
 * Based on validation.ts extractTableNames()
 */
export function extractTableNames(sql: string): string[] {
  const tables: string[] = [];

  // Match FROM and JOIN clauses
  // Pattern: FROM table_name or JOIN table_name
  const fromPattern = /from\s+`?(\w+)`?/gi;
  const joinPattern = /join\s+`?(\w+)`?/gi;

  let match;

  // Extract from FROM clauses
  while ((match = fromPattern.exec(sql)) !== null) {
    tables.push(match[1]);
  }

  // Extract from JOIN clauses
  while ((match = joinPattern.exec(sql)) !== null) {
    tables.push(match[1]);
  }

  // Remove duplicates
  const uniqueTables: string[] = [];
  for (const table of tables) {
    if (uniqueTables.indexOf(table) === -1) {
      uniqueTables.push(table);
    }
  }

  return uniqueTables;
}

/**
 * Extract all tables from multiple SQL queries
 */
export function extractTablesFromQueries(queries: string[]): string[] {
  const allTables = new Set<string>();

  for (const query of queries) {
    const tables = extractTableNames(query);
    tables.forEach(table => allTables.add(table));
  }

  return Array.from(allTables);
}

/**
 * Compare expected vs actual tables
 */
export function compareTableCoverage(
  expected: string[],
  actual: string[]
): {
  expectedSet: Set<string>;
  actualSet: Set<string>;
  missing: string[];
  extra: string[];
  matches: string[];
} {
  const expectedSet = new Set(expected.map(t => t.toLowerCase()));
  const actualSet = new Set(actual.map(t => t.toLowerCase()));

  const missing: string[] = [];
  const matches: string[] = [];

  expectedSet.forEach(table => {
    if (actualSet.has(table)) {
      matches.push(table);
    } else {
      missing.push(table);
    }
  });

  const extra: string[] = [];
  actualSet.forEach(table => {
    if (!expectedSet.has(table)) {
      extra.push(table);
    }
  });

  return { expectedSet, actualSet, missing, extra, matches };
}
```

---

### 3. LLM Evaluators (evaluators.ts)

**Purpose:** Use LLM to evaluate agent's path and answer quality.

#### Path Evaluator

```typescript
import { generateText } from 'ai';

/**
 * Evaluate if agent followed expected path
 */
export async function evaluatePath(params: {
  question: string;
  expectedDescription: string;
  expectedTables: string[];
  actualTrace: {
    toolCalls: string[];  // Tool names in order
    sqlQueries: string[]; // SQL queries executed
    actualTables: string[];
  };
  model: any; // AI SDK model
}): Promise<{
  followedPath: boolean;
  reasoning: string;
  tableCoverageCorrect: boolean;
  missingTables: string[];
  extraTables: string[];
}> {
  const { question, expectedDescription, expectedTables, actualTrace, model } = params;

  const tableCoverage = compareTableCoverage(expectedTables, actualTrace.actualTables);

  const prompt = `You are evaluating whether an AI agent followed the expected approach to answer a database query question.

**Question:** ${question}

**Expected Approach:**
${expectedDescription}

**Expected Tables:** ${expectedTables.join(', ')}

**What the Agent Actually Did:**
- Tools called: ${actualTrace.toolCalls.join(' → ')}
- SQL queries: ${actualTrace.sqlQueries.length} query(s) executed
- Tables touched: ${actualTrace.actualTables.join(', ')}

**SQL Queries Executed:**
${actualTrace.sqlQueries.map((sql, i) => `Query ${i + 1}:\n${sql}`).join('\n\n')}

**Your Task:**
1. Determine if the agent followed the expected approach (yes/no)
2. Explain what was correct and what was wrong
3. Focus on the logical path, not minor syntax differences

Respond in JSON format:
{
  "followedPath": true/false,
  "reasoning": "Detailed explanation of what was right/wrong"
}`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
  });

  // Parse JSON response
  const evaluation = JSON.parse(text);

  return {
    followedPath: evaluation.followedPath,
    reasoning: evaluation.reasoning,
    tableCoverageCorrect: tableCoverage.missing.length === 0,
    missingTables: tableCoverage.missing,
    extraTables: tableCoverage.extra,
  };
}
```

#### Answer Evaluator

```typescript
/**
 * Evaluate answer accuracy
 */
export async function evaluateAnswer(params: {
  question: string;
  expectedCriteria: string;
  sampleValidResponse: string;
  actualAnswer: string;
  model: any;
}): Promise<{
  rating: 'yes' | 'ok' | 'no';
  reasoning: string;
  suggestions?: string;
}> {
  const { question, expectedCriteria, sampleValidResponse, actualAnswer, model } = params;

  const prompt = `You are evaluating the accuracy of an AI agent's answer to a database query question.

**Question:** ${question}

**Expected Answer Criteria:**
${expectedCriteria}

${sampleValidResponse !== 'TODO' ? `**Sample Valid Response:**\n${sampleValidResponse}\n` : ''}

**Agent's Actual Answer:**
${actualAnswer}

**Your Task:**
Rate the answer as:
- **yes**: Correct and complete
- **ok**: Mostly correct but minor issues (could be error in test case setup)
- **no**: Incorrect or incomplete

Respond in JSON format:
{
  "rating": "yes" | "ok" | "no",
  "reasoning": "Explain your rating",
  "suggestions": "If not 'yes', what needs fixing?"
}`;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.1,
  });

  const evaluation = JSON.parse(text);

  return {
    rating: evaluation.rating,
    reasoning: evaluation.reasoning,
    suggestions: evaluation.suggestions,
  };
}
```

---

### 4. Test Runner (test-runner.ts)

**Purpose:** Orchestrate test execution and evaluation.

```typescript
import { InstrumentedAgent } from './agent-tracker.js';
import { extractTablesFromQueries } from './sql-parser.js';
import { evaluatePath, evaluateAnswer } from './evaluators.js';
import { TestCase, TestResult, Evaluation } from './types.js';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * Run a single test case
 */
export async function runTestCase(
  testCase: TestCase,
  config: {
    mcpServerUrl: string;
    agentModel: any;      // Model for agent
    evaluatorModel: any;  // Model for evaluation
    systemPrompt: string;
  }
): Promise<TestResult> {
  const startTime = Date.now();

  // 1. Create instrumented agent
  const agent = new InstrumentedAgent({
    mcpServerUrl: config.mcpServerUrl,
    model: config.agentModel,
    maxSteps: 10,
  });

  try {
    // 2. Initialize agent
    await agent.initialize({ systemPrompt: config.systemPrompt });

    // 3. Send question
    console.log(`\n📝 Test ${testCase.id}: ${testCase.question}`);
    const answer = await agent.chat(testCase.question);

    // 4. Get execution trace
    const trace = agent.getTrace();

    // 5. Extract tables from SQL queries
    const actualTables = extractTablesFromQueries(trace.sqlQueries);

    console.log(`   ✓ Tool calls: ${trace.totalToolCalls} (limit: ${testCase.max_tool_calls})`);
    console.log(`   ✓ Tables: ${actualTables.join(', ')}`);

    // 6. Evaluate path
    console.log(`   🔍 Evaluating path...`);
    const pathEval = await evaluatePath({
      question: testCase.question,
      expectedDescription: testCase.expected_answer_criteria.description,
      expectedTables: testCase.expected_tables,
      actualTrace: {
        toolCalls: trace.workToolCalls.map(tc => tc.toolName),
        sqlQueries: trace.sqlQueries,
        actualTables,
      },
      model: config.evaluatorModel,
    });

    // 7. Evaluate answer
    console.log(`   🔍 Evaluating answer...`);
    const answerEval = await evaluateAnswer({
      question: testCase.question,
      expectedCriteria: testCase.expected_answer_criteria.description,
      sampleValidResponse: testCase.expected_answer_criteria.sample_valid_response,
      actualAnswer: answer,
      model: config.evaluatorModel,
    });

    // 8. Build evaluation result
    const evaluation: Evaluation = {
      table_coverage: {
        passed: pathEval.tableCoverageCorrect,
        expected: testCase.expected_tables,
        actual: actualTables,
        missing: pathEval.missingTables,
      },
      tool_call_efficiency: {
        passed: trace.totalToolCalls <= testCase.max_tool_calls,
        max_allowed: testCase.max_tool_calls,
        actual: trace.totalToolCalls,
      },
      sql_validity: {
        passed: trace.sqlQueries.length > 0 && trace.errors.length === 0,
        queries_executed: trace.sqlQueries.length,
        queries_failed: trace.errors.length,
      },
      error_recovery: {
        passed: trace.errors.length === 0,
        consecutive_errors: trace.errors.length,
        max_allowed: 2,
      },
      answer_correctness: {
        passed: answerEval.rating === 'yes',
        llm_evaluation: answerEval.rating,
        reasoning: answerEval.reasoning,
      },
    };

    // 9. Determine overall pass/fail
    const passed =
      evaluation.table_coverage.passed &&
      evaluation.tool_call_efficiency.passed &&
      evaluation.sql_validity.passed &&
      evaluation.error_recovery.passed &&
      evaluation.answer_correctness.passed;

    const duration = Date.now() - startTime;
    console.log(`   ${passed ? '✅' : '❌'} ${passed ? 'PASSED' : 'FAILED'} (${duration}ms)`);

    // 10. Build result
    const result: TestResult = {
      test_id: testCase.id,
      question: testCase.question,
      passed,
      execution_trace: {
        tool_calls: trace.toolCalls.map(tc => ({
          tool_name: tc.toolName,
          timestamp: tc.timestamp,
          success: tc.success,
          error: tc.error,
        })),
        sql_queries: trace.sqlQueries,
        final_answer: answer,
        errors: trace.errors,
        total_tool_calls: trace.totalToolCalls,
      },
      evaluation,
      timestamp: new Date().toISOString(),
    };

    return result;

  } finally {
    // Cleanup
    await agent.close();
  }
}

/**
 * Run all test cases
 */
export async function runAllTests(
  testCases: TestCase[],
  config: {
    mcpServerUrl: string;
    agentModel: any;
    evaluatorModel: any;
    systemPrompt: string;
  }
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    try {
      const result = await runTestCase(testCase, config);
      results.push(result);
    } catch (error) {
      console.error(`\n❌ Test ${testCase.id} crashed:`, error);

      // Create failure result
      results.push({
        test_id: testCase.id,
        question: testCase.question,
        passed: false,
        execution_trace: {
          tool_calls: [],
          sql_queries: [],
          final_answer: '',
          errors: [error instanceof Error ? error.message : String(error)],
          total_tool_calls: 0,
        },
        evaluation: {
          table_coverage: { passed: false, expected: [], actual: [], missing: [] },
          tool_call_efficiency: { passed: false, max_allowed: 0, actual: 0 },
          sql_validity: { passed: false, queries_executed: 0, queries_failed: 1 },
          error_recovery: { passed: false, consecutive_errors: 1, max_allowed: 2 },
          answer_correctness: { passed: false, llm_evaluation: 'no', reasoning: 'Test crashed' },
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Small delay between tests to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
```

---

### 5. Result Writer (result-writer.ts)

**Purpose:** Save test results to JSON files.

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { TestResult, TestSummary, FailureDetail } from './types.js';

/**
 * Save test results to file
 */
export async function saveResults(
  results: TestResult[],
  outputDir: string = './tests/results'
): Promise<string> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `run-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  // Build summary
  const summary = buildSummary(results);

  // Combine results and summary
  const output = {
    summary,
    results,
  };

  // Write to file
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));

  // Update 'latest' symlink
  const latestPath = path.join(outputDir, 'latest.json');
  if (fs.existsSync(latestPath)) {
    fs.unlinkSync(latestPath);
  }
  fs.symlinkSync(filename, latestPath);

  console.log(`\n💾 Results saved to: ${filepath}`);
  console.log(`💾 Latest results: ${latestPath}`);

  return filepath;
}

/**
 * Build test summary
 */
function buildSummary(results: TestResult[]): TestSummary {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const failures: FailureDetail[] = results
    .filter(r => !r.passed)
    .map(r => ({
      test_id: r.test_id,
      question: r.question,
      failure_reasons: getFailureReasons(r),
    }));

  return {
    total_tests: total,
    passed,
    failed,
    pass_rate: passRate,
    failures,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract failure reasons from result
 */
function getFailureReasons(result: TestResult): string[] {
  const reasons: string[] = [];

  if (!result.evaluation.table_coverage.passed) {
    reasons.push(`Missing tables: ${result.evaluation.table_coverage.missing.join(', ')}`);
  }

  if (!result.evaluation.tool_call_efficiency.passed) {
    reasons.push(
      `Too many tool calls: ${result.evaluation.tool_call_efficiency.actual} > ${result.evaluation.tool_call_efficiency.max_allowed}`
    );
  }

  if (!result.evaluation.sql_validity.passed) {
    reasons.push(`SQL errors: ${result.evaluation.sql_validity.queries_failed} failed`);
  }

  if (!result.evaluation.answer_correctness.passed) {
    reasons.push(`Answer incorrect: ${result.evaluation.answer_correctness.reasoning}`);
  }

  if (result.execution_trace.errors.length > 0) {
    reasons.push(`Errors: ${result.execution_trace.errors.join('; ')}`);
  }

  return reasons;
}

/**
 * Print summary to console
 */
export function printSummary(summary: TestSummary): void {
  console.log('\n' + '═'.repeat(60));
  console.log('                    TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Tests:    ${summary.total_tests}`);
  console.log(`Passed:         ${summary.passed} ✅`);
  console.log(`Failed:         ${summary.failed} ❌`);
  console.log(`Pass Rate:      ${summary.pass_rate.toFixed(1)}%`);
  console.log('═'.repeat(60));

  if (summary.failures.length > 0) {
    console.log('\nFailed Tests:');
    summary.failures.forEach(failure => {
      console.log(`\n  ❌ Test ${failure.test_id}: ${failure.question}`);
      failure.failure_reasons.forEach(reason => {
        console.log(`     - ${reason}`);
      });
    });
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}
```

---

### 6. CLI Runner (cli.ts)

**Purpose:** Command-line interface for running tests.

```typescript
import { config } from 'dotenv';
import * as fs from 'fs';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { runAllTests, runTestCase } from './test-runner.js';
import { saveResults, printSummary } from './result-writer.js';
import { TestCase } from './types.js';

// Load environment variables
config();

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const testId = args.find(arg => arg.startsWith('--id='))?.split('=')[1];
  const complexity = args.find(arg => arg.startsWith('--complexity='))?.split('=')[1];

  // Validate environment
  const mcpServerUrl = process.env.MCP_SERVER_URL;
  if (!mcpServerUrl) {
    console.error('❌ MCP_SERVER_URL not set in .env');
    process.exit(1);
  }

  // Select models
  let agentModel, evaluatorModel, modelName;

  if (process.env.ANTHROPIC_API_KEY) {
    const modelId = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4';
    agentModel = anthropic(modelId);
    evaluatorModel = anthropic(modelId);
    modelName = `Claude (${modelId})`;
  } else if (process.env.OPENAI_API_KEY) {
    const modelId = process.env.OPENAI_MODEL || 'gpt-4o';
    agentModel = openai(modelId);
    evaluatorModel = openai(modelId);
    modelName = `OpenAI (${modelId})`;
  } else {
    console.error('❌ No API key found');
    process.exit(1);
  }

  // Load test cases
  const testCasesJson = fs.readFileSync('./tests/test-cases.json', 'utf-8');
  let testCases: TestCase[] = JSON.parse(testCasesJson);

  // Filter by ID or complexity
  if (testId) {
    testCases = testCases.filter(tc => tc.id === parseInt(testId));
    if (testCases.length === 0) {
      console.error(`❌ Test ID ${testId} not found`);
      process.exit(1);
    }
  } else if (complexity) {
    testCases = filterByComplexity(testCases, complexity);
  }

  // System prompt
  const systemPrompt = `You are a VC analyst with access to the Fundable dataset...`;

  // Print header
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║          🧪 AI Agent Evaluation Framework 🧪               ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 MCP Server: ${mcpServerUrl}`);
  console.log(`🧠 Model: ${modelName}`);
  console.log(`📊 Running ${testCases.length} test(s)\n`);

  // Run tests
  const results = await runAllTests(testCases, {
    mcpServerUrl,
    agentModel,
    evaluatorModel,
    systemPrompt,
  });

  // Save and display results
  await saveResults(results);
  printSummary(buildSummaryFromResults(results));
}

/**
 * Filter test cases by complexity
 */
function filterByComplexity(testCases: TestCase[], complexity: string): TestCase[] {
  const complexityMap: Record<string, number> = {
    simple: 1,
    medium: 2,
    hard: 3,
  };

  const targetCalls = complexityMap[complexity.toLowerCase()];
  if (!targetCalls) {
    console.error(`❌ Invalid complexity: ${complexity}`);
    console.error('   Valid: simple, medium, hard');
    process.exit(1);
  }

  return testCases.filter(tc => tc.max_tool_calls === targetCalls);
}

main().catch(console.error);
```

---

## Data Structures

All data structures are defined in `tests/types.ts` (already exists). Key types:

- `TestCase` - Input test definition
- `TestResult` - Output after running test
- `ExecutionTrace` - Tool calls, SQL, errors during test
- `Evaluation` - Assessment results
- `TestSummary` - Aggregate statistics

---

## Implementation Plan

### Phase 1: Foundation (Days 1-2)
- [ ] Create `sql-parser.ts` with table extraction
- [ ] Create `agent-tracker.ts` wrapper class
- [ ] Test instrumentation with simple example

### Phase 2: Evaluation (Days 3-4)
- [ ] Create `evaluators.ts` with LLM prompts
- [ ] Test path evaluation manually
- [ ] Test answer evaluation manually

### Phase 3: Orchestration (Days 5-6)
- [ ] Create `test-runner.ts` with test execution
- [ ] Create `result-writer.ts` for saving results
- [ ] Run single test end-to-end

### Phase 4: CLI & Polish (Day 7)
- [ ] Create `cli.ts` with argument parsing
- [ ] Add npm scripts to package.json
- [ ] Test filtering by ID and complexity
- [ ] Documentation and examples

---

## Testing Strategy

### Unit Testing
- Test `extractTableNames()` with known SQL queries
- Test `compareTableCoverage()` with various scenarios
- Test `InstrumentedAgent` trace capture

### Integration Testing
- Run evaluation on 1-2 known test cases
- Verify JSON output structure
- Validate LLM evaluation quality

### Acceptance Testing
- Run full test suite (all 16 tests)
- Review failure reasons for accuracy
- Adjust evaluation prompts based on results

---

## Open Questions / Decisions Needed

1. **Model selection for evaluation:**
   - Same model as agent (current plan) OR
   - Cheaper model (e.g., GPT-4o-mini, Claude Haiku)

2. **Retry logic:**
   - Should failed tests be retried automatically?
   - How many retries before marking as failed?

3. **Rate limiting:**
   - Current: 1 second delay between tests
   - Adjust based on API limits?

4. **Result storage:**
   - Keep all historical results OR
   - Auto-cleanup after N runs?

---

## Success Criteria

Framework is complete when:
1. ✅ Can run all 16 test cases sequentially
2. ✅ Accurately counts tool calls (excluding context tools)
3. ✅ Extracts tables from SQL queries
4. ✅ LLM evaluates path and answer
5. ✅ Saves results to JSON with timestamp
6. ✅ CLI supports filtering by ID and complexity
7. ✅ Clear summary with pass/fail rates

---

**End of Technical Specification**
