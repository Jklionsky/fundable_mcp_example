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

  const prompt = `You are evaluating the overall performance of an AI agent on a database query task. Your job is to make a holistic judgment considering ALL aspects of performance.

**The Question:**
${question}

**Expected Approach:**
${expectedPathDescription}

**Expected Answer Example:**
${expectedAnswer}

---

**What the Agent Actually Did:**

**Tools Used:** ${toolCallsUsed} calls (expected: ≤${maxToolCalls})
${toolCallNames.join(' → ')}

**SQL Queries (${sqlQueries.length}):**
${sqlQueries.map((sql, i) => `Query ${i + 1}:\n${sql}`).join('\n\n') || 'None'}

**Agent's Answer:**
${actualAnswer}

---

**Your Task:**

Make a holistic judgment about the agent's performance. Consider:

1. **Logical Approach**: Did they take a reasonable path given the question? Even if not the "expected" path, was it sound? If they used information from previous context in conversation that is acceptable, do not penalize them for it.

2. **Answer Quality**: Is the answer correct? An answer can be correct even if it is not exactly like the example answer. Some examples of a defensible answer:
   - Ambiguity in the question (e.g., "Stanford alumni" - which programs count?)
   - Missing information that was't explicitly asked for in the question (if the example answers include information that was not explicitly asked for, do not penalize them for it)
   - Query results are correct, but answer didn't explicity state all information in the query results

3. **Efficiency**: Did they complete it in reasonable time/tool calls?
   - This is a FACTOR, not a hard constraint
   - Some inefficiency is acceptable if the answer is sufficient 
   - Taking more than +2 more calls than expected should always be considered a major inefficiency

**Grading Scale:**
- **pass**: Successfully completed the task. Answer is defensible, approach is logical, efficiency is reasonable.
- **fail**: Did not successfully complete the task. Examples:
  - Answer is incorrect or incomplete
  - Approach is fundamentally flawed
  - Took more than +2 calls than expected

**Important:**
- Be generous with ambiguous questions - if their interpretation is defensible, don't penalize
- Focus on whether they demonstrated competent reasoning
- Explain your reasoning clearly

Respond in JSON format:
{
  "grade": "pass" | "fail",
  "reasoning": "Comprehensive explanation of your judgment, covering approach quality, answer correctness, and efficiency"
}`;

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
