/**
 * Test case structure for evaluating the SQL agent
 */

export interface TestCase {
  id: number;
  question: string;
  max_tool_calls: number;
  expected_path_description: string;
  expected_answer: string;
}

/**
 * Test execution result
 */
export interface TestResult {
  test_id: number;
  question: string;
  passed: boolean;
  execution_trace: ExecutionTrace;
  evaluation: Evaluation;
  timestamp: string;
}

export interface ExecutionTrace {
  tool_calls: ToolCall[];
  sql_queries: string[];
  final_answer: string;
  total_tool_calls: number;
}

export interface ToolCall {
  tool_name: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface Evaluation {
  path_correctness: {
    passed: boolean;
    reasoning: string;
  };
  tool_call_efficiency: {
    passed: boolean;
    max_allowed: number;
    actual: number;
  };
  answer_correctness: {
    passed: boolean;
    llm_evaluation: string;
    reasoning: string;
  };
}

/**
 * Test suite summary
 */
export interface TestSummary {
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
  failures: FailureDetail[];
  timestamp: string;
}

export interface FailureDetail {
  test_id: number;
  question: string;
  failure_reasons: string[];
}

/**
 * New unified result structure
 */

export interface TestMetadata {
  total_tests: number;
  passed: number;
  failed: number;
  pass_rate: number;
  timestamp: string;
}

export interface UnifiedTestResult {
  test_id: number;
  question: string;
  grade: 'pass' | 'fail';
  reasoning: string;
  tools_called_num: number;
  tools_called_expected: number;
  answer: string;
  expected_answer: string;
  sql_queries: string[];
  expected_path: string;
}

export interface UnifiedResultOutput {
  metadata: TestMetadata;
  tests: UnifiedTestResult[];
}
