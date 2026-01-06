/**
 * Result Writer - Save test results and generate summaries
 *
 * Handles:
 * - Saving results to timestamped JSON files
 * - Building test summaries with statistics
 * - Extracting failure reasons
 * - Printing formatted console output
 */

import * as fs from 'fs';
import * as path from 'path';

import { TestResult, TestSummary, FailureDetail, UnifiedTestResult, UnifiedResultOutput, TestMetadata } from './types.js';

/**
 * Save test results to file (unified format)
 *
 * Creates a timestamped JSON file with metadata and test results.
 * Results are organized into subdirectories by test suite.
 *
 * @param results Test results to save
 * @param suiteName Test suite name (easy, medium, hard, or all)
 * @param modelName LLM model identifier (e.g., gpt-4o, claude-sonnet-4)
 * @param outputDir Output directory (defaults to ./tests/results)
 * @returns Path to saved file
 */
export async function saveResults(
  results: UnifiedTestResult[],
  suiteName: string = 'all',
  modelName: string = 'unknown',
  outputDir: string = './tests/results'
): Promise<string> {
  // Sanitize model name for filename (remove slashes, spaces, etc.)
  const sanitizedModel = modelName.replace(/[^a-zA-Z0-9-_.]/g, '-').toLowerCase();

  // Generate ISO timestamp for filename (replace : with - for filesystem compatibility)
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');

  // New filename format: {model}-{timestamp}.json
  const filename = `${sanitizedModel}-${timestamp}.json`;

  // Determine subdirectory based on suite (easy, medium, hard, or all)
  const subDir = path.join(outputDir, suiteName);
  const filepath = path.join(subDir, filename);

  // Ensure subdirectory exists (e.g., tests/results/easy/)
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir, { recursive: true });
  }

  // Build unified output
  const output = buildUnifiedResults(results);

  // Write to file with pretty formatting
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));

  console.log(`\n💾 Results saved to: ${filepath}`);

  return filepath;
}

/**
 * Build unified result output from test results
 *
 * Creates a single unified structure with metadata and all test details.
 */
export function buildUnifiedResults(results: UnifiedTestResult[]): UnifiedResultOutput {
  const total = results.length;
  const passed = results.filter(r => r.grade === 'pass').length;
  const failed = results.filter(r => r.grade === 'fail').length;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const metadata: TestMetadata = {
    total_tests: total,
    passed,
    failed,
    pass_rate: passRate,
    timestamp: new Date().toISOString(),
  };

  return {
    metadata,
    tests: results,
  };
}

/**
 * Build test summary from results (legacy)
 *
 * Calculates aggregate statistics and extracts failure details.
 */
export function buildSummary(results: TestResult[]): TestSummary {
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
 *
 * Analyzes all evaluation criteria to determine why a test failed.
 */
export function getFailureReasons(result: TestResult): string[] {
  const reasons: string[] = [];

  // Check path correctness
  if (!result.evaluation.path_correctness.passed) {
    reasons.push(`Path incorrect: ${result.evaluation.path_correctness.reasoning}`);
  }

  // Check tool call efficiency
  if (!result.evaluation.tool_call_efficiency.passed) {
    reasons.push(
      `Too many tool calls: ${result.evaluation.tool_call_efficiency.actual} > ${result.evaluation.tool_call_efficiency.max_allowed}`
    );
  }

  // Check answer correctness
  if (!result.evaluation.answer_correctness.passed) {
    const rating = result.evaluation.answer_correctness.llm_evaluation;
    const reasoning = result.evaluation.answer_correctness.reasoning;
    reasons.push(`Answer ${rating}: ${reasoning}`);
  }

  return reasons;
}

/**
 * Print summary to console (unified format)
 *
 * Displays formatted test results with pass/fail counts and reasoning.
 */
export function printSummary(output: UnifiedResultOutput): void {
  const { metadata, tests } = output;

  console.log('\n' + '═'.repeat(60));
  console.log('                    TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Tests:    ${metadata.total_tests}`);
  console.log(`Passed:         ${metadata.passed} ✅`);
  console.log(`Failed:         ${metadata.failed} ❌`);
  console.log(`Pass Rate:      ${metadata.pass_rate.toFixed(1)}%`);
  console.log('═'.repeat(60));

  // Show failed tests
  const failedTests = tests.filter(t => t.grade === 'fail');

  if (failedTests.length > 0) {
    console.log('\nFailed Tests:');
    failedTests.forEach(test => {
      console.log(`\n  ❌ Test ${test.test_id}: ${test.question}`);
      console.log(`     ${test.reasoning}`);
    });
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}
