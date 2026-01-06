# SQL Agent Test Framework

## Overview
This directory contains the test framework for evaluating the SQL agent's performance on the VC dataset.

## File Structure

```
tests/
├── test-cases.json          # Test questions with expected criteria (FILL THIS OUT)
├── types.ts                 # TypeScript interfaces
├── README.md               # This file
├── test-runner.ts          # Test execution engine (TO BE BUILT)
├── evaluators.ts           # Evaluation logic (TO BE BUILT)
└── results/                # Test execution results (TO BE CREATED)
```

## How to Fill Out test-cases.json

Each test case needs the following fields completed:

### 1. `expected_tables` (array of strings)
List all database tables that the SQL query SHOULD touch to answer the question correctly.

**Available tables:**
- `organizations` - Companies and investors
- `deals` - Funding rounds
- `institutional_investments` - VC firm investments in deals
- `angel_investments` - Individual angel investments
- `people` - Person records
- `organization_associations` - People-to-org relationships (current/key roles)
- `linkedin_positions` - Full LinkedIn work history
- `linkedin_company` - All LinkedIn companies
- `linkedin_person_education` - Education records
- `linkedin_education` - Educational institutions
- `articles` - News articles about deals
- `valuations` - Company valuations over time
- `organization_industries` - Company-to-industry mappings
- `industry_classifications` - Industry definitions

**Example:**
```json
"expected_tables": ["organizations", "deals"]
```

### 2. `max_tool_calls` (number)
Maximum number of tool calls allowed (typically 1-2, allowing for 1 error/retry).

**Guidelines:**
- Simple lookup questions: `1` (or `2` allowing 1 error)
- Questions requiring discovery first (like finding company by name): `2` (or `3` allowing 1 error)
- Complex multi-step questions: `3-4`

**Example:**
```json
"max_tool_calls": 2
```

### 3. `expected_answer_criteria` (object)

#### `type` (string)
One of:
- `"exact_number"` - Answer is a count or numerical value
- `"list"` - Answer is a ranked or unranked list
- `"entity_with_fields"` - Answer is a specific entity with multiple fields
- `"comparative"` - Answer compares multiple values

#### `description` (string)
Clear description of what the correct answer should contain. This guides the LLM evaluator.

**Example:**
```json
"description": "Should return total_raised for Ramp using domain lookup (ramp.com). Value should be in billions with appropriate formatting."
```

#### `sample_valid_response` (string)
An example of what a correct answer looks like. This helps calibrate the LLM evaluator.

**Example:**
```json
"sample_valid_response": "Ramp has raised $1.2 billion all time."
```

## Example: Completed Test Case

```json
{
  "id": 1,
  "question": "how many deals happened in 2024",
  "expected_tables": ["deals"],
  "max_tool_calls": 2,
  "expected_answer_criteria": {
    "type": "exact_number",
    "description": "Should count all deals where EXTRACT(YEAR FROM date) = 2024. The answer must be a specific number.",
    "sample_valid_response": "There were 1,234 deals in 2024."
  }
}
```

## Next Steps After Completion

1. ✅ Fill out all TODO fields in `test-cases.json`
2. ⬜ Build test runner (`test-runner.ts`)
3. ⬜ Build evaluators (`evaluators.ts`)
4. ⬜ Run first test suite
5. ⬜ Analyze results and iterate

## Notes

- **Domain lookups**: When a question includes a URL (like https://ramp.com/), the agent should use `WHERE domain = 'ramp.com'` for exact matching
- **Name lookups**: When no domain is available, use `WHERE LOWER(name) LIKE '%searchterm%'` to discover entities first
- **Date filtering**: Use `TIMESTAMP('YYYY-MM-DD')` for exact dates, `EXTRACT(YEAR FROM date)` for year filtering
- **Case sensitivity**: Always use `LOWER()` for text matching in BigQuery
- **Values in millions**: Remember that `total_raised` and `valuation_usd` are stored in millions (1000 = $1B)
