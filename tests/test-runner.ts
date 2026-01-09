/**
 * Test Runner - Main orchestrator for agent evaluation
 *
 * Coordinates test execution by:
 * 1. Creating agents
 * 2. Running test cases
 * 3. Extracting execution traces
 * 4. Evaluating performance (path and answer)
 * 5. Building test results
 */

import { AIAgent } from '../src/agent.js';
import { evaluateHolistically } from './helpers/holistic-evaluator.js';
import { TestCase, Evaluation, UnifiedTestResult } from './helpers/types.js';
import { LanguageModel } from 'ai';
import { config } from 'dotenv';
import * as fs from 'fs';
import { saveResults, printSummary, buildUnifiedResults } from './helpers/result-writer.js';
import { getPrompt } from '../src/prompt-loader.js';
import { getModel } from '../src/helpers.js';

/**
 * Context tools that don't count toward tool call limits
 * These are preparatory tools for gathering schema information
 */
const CONTEXT_TOOLS = new Set([
  'getDatasetContext',
  'listDatasetTables',
  'getTableDetails'
]);

/**
 * Tool call record with execution details
 */
interface ToolCallRecord {
  toolName: string;
  timestamp: string;
  success: boolean;
  error?: string;
  isContextTool: boolean;  // If true, doesn't count toward tool call limits
}

/**
 * Processed execution trace for test evaluation
 */
interface ProcessedTrace {
  toolCalls: ToolCallRecord[];  // All tool calls with metadata
  sqlQueries: string[];         // Extracted SQL queries from queryVCData
}

/**
 * Transform agent trace to processed format for test evaluation
 * Categorizes tools and extracts SQL queries
 */
function processAgentTrace(
  agentTrace: Array<{toolName: string, input: any, output: any, stepNumber: number}>
): ProcessedTrace {
  const processed: ProcessedTrace = {
    toolCalls: [],
    sqlQueries: []
  };

  agentTrace.forEach((toolCall, index) => {
    const isContextTool = CONTEXT_TOOLS.has(toolCall.toolName);

    // Create tool call record
    const record: ToolCallRecord = {
      toolName: toolCall.toolName,
      timestamp: `${Date.now()}-${index}`,
      success: toolCall.output !== null && toolCall.output !== undefined,
      error: toolCall.output === null || toolCall.output === undefined ? 'No output' : undefined,
      isContextTool
    };
    processed.toolCalls.push(record);

    // Extract SQL if this is queryVCData (and it's a work tool)
    if (!isContextTool && toolCall.toolName === 'queryVCData' && toolCall.input?.sql) {
      processed.sqlQueries.push(toolCall.input.sql);
    }
  });

  return processed;
}

/**
 * Configuration for test execution
 */
export interface TestConfig {
  mcpServerUrl: string;
  mcpApiKey?: string;             // Optional API key for MCP auth (bypasses OAuth)
  agentModel: LanguageModel;      // Model for the agent being tested
  evaluatorModel: LanguageModel;  // Model for LLM-based evaluation
  systemPrompt: string;
  verbose: boolean;               // Enable verbose logging
}

/**
 * Run a single test case
 *
 * Executes the test, captures trace, runs evaluations, and returns results.
 * Handles errors gracefully to ensure one test failure doesn't crash the suite.
 */
export async function runTestCase(
  testCase: TestCase,
  config: TestConfig,
  agent: AIAgent
): Promise<UnifiedTestResult> {
  const startTime = Date.now();

  try {
    // Send question to agent
    console.log(`\n📝 Test ${testCase.id}: ${testCase.question}`);
    const answer = await agent.chat(testCase.question);

    // Get execution trace for this question and process it
    const agentTrace = agent.getLastTrace();
    const trace = processAgentTrace(agentTrace);

    // Filter work tools (non-context tools) and compute total
    const workToolCalls = trace.toolCalls.filter(tc => !tc.isContextTool);
    const totalToolCalls = workToolCalls.length;

    // console.log(`   ✓ Tool calls: ${totalToolCalls} (limit: ${testCase.max_tool_calls})`);

    // Perform holistic evaluation
    console.log(`   🎯 Performing holistic evaluation...`);
    const holisticEval = await evaluateHolistically({
      question: testCase.question,
      expectedPathDescription: testCase.expected_path_description,
      expectedAnswer: testCase.expected_answer,
      maxToolCalls: testCase.max_tool_calls,
      actualAnswer: answer,
      toolCallsUsed: totalToolCalls,
      toolCallNames: workToolCalls.map(tc => tc.toolName),
      sqlQueries: trace.sqlQueries,
      model: config.evaluatorModel,
    });

    const duration = Date.now() - startTime;
    const gradeEmoji = holisticEval.grade === 'pass' ? '✅' : '❌';
    const gradeLabel = holisticEval.grade.toUpperCase();
    console.log(`   ${gradeEmoji} ${gradeLabel} (${duration}ms)`);

    // Build unified result with flat structure
    const result: UnifiedTestResult = {
      test_id: testCase.id,
      question: testCase.question,
      grade: holisticEval.grade,
      reasoning: holisticEval.reasoning,
      tools_called_num: totalToolCalls,
      tools_called_expected: testCase.max_tool_calls,
      answer: answer,
      expected_answer: testCase.expected_answer,
      sql_queries: trace.sqlQueries,
      expected_path: testCase.expected_path_description,
    };

    return result;

  } catch (error) {
    // Handle test crash - create failure result
    console.error(`   ❌ Test crashed:`, error);

    const duration = Date.now() - startTime;
    console.log(`   ❌ FAILED (crashed after ${duration}ms)`);

    return {
      test_id: testCase.id,
      question: testCase.question,
      grade: 'fail' as const,
      reasoning: `Test execution crashed with error: ${error instanceof Error ? error.message : String(error)}`,
      tools_called_num: 0,
      tools_called_expected: testCase.max_tool_calls,
      answer: '',
      expected_answer: testCase.expected_answer,
      sql_queries: [],
      expected_path: testCase.expected_path_description,
    };
  }
}

/**
 * Run all test cases sequentially
 *
 * Executes each test case with a delay between tests to avoid rate limits.
 * Ensures all tests run even if some crash.
 */
export async function runAllTests(
  testCases: TestCase[],
  config: TestConfig
): Promise<UnifiedTestResult[]> {
  const results: UnifiedTestResult[] = [];

  // Create a single agent for all tests to maintain conversation context
  // Verbose flag is controlled by CLI argument (default: false)
  const agent = new AIAgent({
    mcpServerUrl: config.mcpServerUrl,
    apiKey: config.mcpApiKey,
    model: config.agentModel,
    verbose: true,
  });

  try {
    // Initialize agent with system prompt once
    // maxSteps: 15 allows complex queries (4-6 tool calls) plus response generation
    await agent.initialize({
      systemPrompt: config.systemPrompt,
      maxSteps: 15
    });

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];

      try {
        const result = await runTestCase(testCase, config, agent);
        results.push(result);
    } catch (error) {
      // This shouldn't happen since runTestCase handles its own errors,
      // but just in case, create a failure result
      console.error(`\n❌ Unexpected error running test ${testCase.id}:`, error);

      results.push({
        test_id: testCase.id,
        question: testCase.question,
        grade: 'fail' as const,
        reasoning: `Unexpected error in test runner: ${error instanceof Error ? error.message : String(error)}`,
        tools_called_num: 0,
        tools_called_expected: testCase.max_tool_calls,
        answer: '',
        expected_answer: testCase.expected_answer,
        sql_queries: [],
        expected_path: testCase.expected_path_description,
      });
    }

      // Small delay between tests to avoid rate limits
      // Skip delay after last test
      if (i < testCases.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  } finally {
    // Cleanup - close agent connection
    await agent.close();
  }
}

/**
 * ============================================================================
 * CLI Interface
 * ============================================================================
 * Command-line interface for test evaluation
 *
 * Usage:
 *   npm run test:eval                          # Run all suites (easy, medium, hard)
 *   npm run test:eval -- --suite=easy          # Run easy suite only
 *   npm run test:eval -- --suite=easy --id=5   # Run test #5 from easy suite
 */

// Load environment variables from .env
config();

/**
 * Load test cases from a specific test suite file
 */
function loadTestSuite(suiteName: 'easy' | 'medium' | 'hard'): TestCase[] {
  const path = `./tests/test-suite/test-cases-${suiteName}.json`;
  if (!fs.existsSync(path)) {
    console.error(`❌ Test suite not found: ${path}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const suite = args.find(arg => arg.startsWith('--suite='))?.split('=')[1] || 'all';
  const testId = args.find(arg => arg.startsWith('--id='))?.split('=')[1];
  const provider = args.find(arg => arg.startsWith('--provider='))?.split('=')[1] || null;
  const verbose = args.includes('-v') || args.includes('--verbose');

  // Validate environment
  const mcpServerUrl = process.env.MCP_SERVER_URL;
  if (!mcpServerUrl) {
    console.error('❌ MCP_SERVER_URL not set in .env');
    console.error('   Please add: MCP_SERVER_URL=http://localhost:3000');
    process.exit(1);
  }

  // Optional API key for authentication (bypasses OAuth)
  const mcpApiKey = process.env.MCP_API_KEY;

  // Get the AI model using the same logic as the main app
  // Provider can be specified via --provider flag, or auto-detected
  const { model, modelName } = getModel(provider);

  // Use the same model for both agent and evaluator
  const agentModel = model;
  const evaluatorModel = model;

  // Validate suite parameter
  const validSuites = ['all', 'easy', 'medium', 'hard'];
  if (!validSuites.includes(suite)) {
    console.error(`❌ Invalid suite: ${suite}`);
    console.error('   Valid options: all, easy, medium, hard');
    process.exit(1);
  }

  // Validate that --id requires --suite to be specific (not 'all')
  if (testId && suite === 'all') {
    console.error(`❌ When using --id, you must specify a specific suite (easy, medium, or hard)`);
    console.error('   Example: npm run test:eval -- --suite=easy --id=5');
    process.exit(1);
  }

  // Determine which suites to run
  const suitesToRun: Array<'easy' | 'medium' | 'hard'> =
    suite === 'all' ? ['easy', 'medium', 'hard'] : [suite as 'easy' | 'medium' | 'hard'];

  // Load system prompt from centralized configuration with test mode suffix
  const systemPrompt = getPrompt('vc_analyst') + '\n' + getPrompt('test_mode_suffix');

  // Print header
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          🧪 AI Agent Evaluation Framework 🧪               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 MCP Server: ${mcpServerUrl}`);
  console.log(`🔑 Auth: ${mcpApiKey ? 'API Key' : 'OAuth'}`);
  console.log(`🧠 Model: ${modelName}`);

  // Run tests for each suite
  let allResults: UnifiedTestResult[] = [];
  let totalTestCount = 0;
  const overallStartTime = Date.now();

  for (const currentSuite of suitesToRun) {
    // Load test cases for this suite
    let testCases = loadTestSuite(currentSuite);

    // Filter by ID if specified
    if (testId) {
      testCases = testCases.filter(tc => tc.id === parseInt(testId));
      if (testCases.length === 0) {
        console.error(`❌ Test ID ${testId} not found in ${currentSuite} suite`);
        process.exit(1);
      }
    }

    totalTestCount += testCases.length;
    console.log(`📊 Running ${testCases.length} test(s) from ${currentSuite} suite\n`);

    // Run tests for this suite
    const suiteStartTime = Date.now();
    const suiteResults = await runAllTests(testCases, {
      mcpServerUrl,
      mcpApiKey,
      agentModel,
      evaluatorModel,
      systemPrompt,
      verbose,
    });
    const suiteDuration = Date.now() - suiteStartTime;

    // Save results for this suite immediately (each suite gets its own file)
    await saveResults(suiteResults, currentSuite, modelName, suiteDuration);

    // Accumulate results for combined summary
    allResults = allResults.concat(suiteResults);
  }

  const overallDuration = Date.now() - overallStartTime;
  console.log(`\n✅ Completed ${totalTestCount} total test(s)\n`);

  // Display combined summary
  const output = buildUnifiedResults(allResults, overallDuration);
  printSummary(output);

  // Exit with error code if any tests failed
  process.exit(output.metadata.failed > 0 ? 1 : 0);
}

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}
