/**
 * Prompt Loader - Centralized prompt management
 *
 * Loads prompts from prompts.yaml configuration file.
 * Provides type-safe access to system prompts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// Get current directory for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Available prompt keys
 */
export type PromptKey = 'vc_analyst' | 'vc_analyst_eval' | 'test_mode_suffix' | 'holistic_evaluator' | 'default';

/**
 * Prompt configuration structure
 */
interface PromptConfig {
  vc_analyst: string;
  vc_analyst_eval: string;
  test_mode_suffix: string;
  holistic_evaluator: string;
  default: string;

}

/**
 * Cached prompts to avoid re-reading file
 */
let cachedPrompts: PromptConfig | null = null;

/**
 * Load prompts from YAML file
 */
function loadPrompts(): PromptConfig {
  if (cachedPrompts) {
    return cachedPrompts;
  }

  const promptsPath = path.join(__dirname, '..', 'prompts.yaml');

  if (!fs.existsSync(promptsPath)) {
    throw new Error(`Prompts file not found at ${promptsPath}`);
  }

  const fileContents = fs.readFileSync(promptsPath, 'utf8');
  const prompts = yaml.load(fileContents) as PromptConfig;

  cachedPrompts = prompts;
  return prompts;
}

/**
 * Get a specific prompt by key
 *
 * @param key - The prompt key to retrieve
 * @returns The prompt text
 */
export function getPrompt(key: PromptKey): string {
  const prompts = loadPrompts();
  const prompt = prompts[key];

  if (!prompt) {
    throw new Error(`Prompt '${key}' not found in prompts.yaml`);
  }

  return prompt;
}

/**
 * Get all prompts
 */
export function getAllPrompts(): PromptConfig {
  return loadPrompts();
}
