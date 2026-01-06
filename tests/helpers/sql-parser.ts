/**
 * SQL Table Extraction Utilities
 *
 * Extract table names from SQL queries using regex patterns.
 * Based on proven implementation from validation.ts
 */

/**
 * Extract table names from SQL query
 * Matches FROM and JOIN clauses to identify all referenced tables
 */
export function extractTableNames(sql: string): string[] {
  const tables: string[] = [];

  // Match FROM and JOIN clauses
  // Pattern: FROM table_name or JOIN table_name
  const fromPattern = /from\s+`?(\w+)`?/gi;
  const joinPattern = /join\s+`?(\w+)`?/gi;

  let match: RegExpExecArray | null;

  // Extract from FROM clauses
  while ((match = fromPattern.exec(sql)) !== null) {
    tables.push(match[1]);
  }

  // Extract from JOIN clauses
  while ((match = joinPattern.exec(sql)) !== null) {
    tables.push(match[1]);
  }

  // Remove duplicates manually (avoid Set spread for TypeScript compatibility)
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
 * Aggregates table names across all queries and returns unique set
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
 * Returns detailed comparison including matches, missing, and extra tables
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
