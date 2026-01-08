/**
 * Holistic evaluation of agent performance
 *
 * Provides a comprehensive assessment that considers:
 * 1. Logical approach (was the reasoning sound?)
 * 2. Answer quality (correct? defensible if ambiguous?)
 * 3. Efficiency (reasonable tool usage?)
 *
 * Returns a grade (pass/fail) with rich reasoning instead of binary pass/fail.
 */

import { generateText } from 'ai';
import { getPrompt } from '../../src/prompt-loader.js';

/**
 * Extract JSON from markdown code fences
 * Handles cases where LLM returns ```json ... ``` wrapped responses
 */
function extractJSON(text: string): string {
  // Remove markdown code fences if present
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  // Return original text if no code fences found
  return text.trim();
}

/**
 * Holistic evaluation result
 */
export interface HolisticEvaluation {
  grade: 'pass' | 'fail';
  reasoning: string;
}

/**
 * Perform comprehensive evaluation of agent performance
 *
 * Takes all available context and makes a holistic judgment about whether
 * the agent successfully completed the task, considering:
 * - Question ambiguity and difficulty
 * - Logical soundness of approach
 * - Answer correctness (or validity of alternate interpretation)
 * - Efficiency and tool usage
 */
export async function evaluateHolistically(params: {
  // Test case information
  question: string;
  expectedPathDescription: string;
  expectedAnswer: string;
  maxToolCalls: number;

  // Agent's actual performance
  actualAnswer: string;
  toolCallsUsed: number;
  toolCallNames: string[];
  sqlQueries: string[];

  model: any; // AI SDK model
}): Promise<HolisticEvaluation> {
  const {
    question,
    expectedPathDescription,
    expectedAnswer,
    maxToolCalls,
    actualAnswer,
    toolCallsUsed,
    toolCallNames,
    sqlQueries,
    model,
  } = params;

  // Load prompt template from yaml and fill in values
  const promptTemplate = getPrompt('holistic_evaluator');
  const prompt = promptTemplate
    .replace('{question}', question)
    .replace('{expectedPathDescription}', expectedPathDescription)
    .replace('{expectedAnswer}', expectedAnswer)
    .replace('{toolCallsUsed}', toolCallsUsed.toString())
    .replace('{maxToolCalls}', maxToolCalls.toString())
    .replace('{toolCallNames}', toolCallNames.join(' → '))
    .replace('{sqlQueriesCount}', sqlQueries.length.toString())
    .replace(
      '{sqlQueries}',
      sqlQueries.map((sql, i) => `Query ${i + 1}:\n${sql}`).join('\n\n') || 'None'
    )
    .replace('{actualAnswer}', actualAnswer);

  const { text } = await generateText({
    model,
    prompt,
  });

  // Extract and parse JSON response
  const cleanJSON = extractJSON(text);
  const evaluation = JSON.parse(cleanJSON);

  return {
    grade: evaluation.grade,
    reasoning: evaluation.reasoning,
  };
}
