import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { LanguageModel } from "ai";

/**
 * Supported AI providers for caching and optimizations
 */
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'unknown';

/**
 * Detect the AI provider from a LanguageModel instance
 * Used for provider-specific optimizations like prompt caching
 */
export function detectProvider(model: LanguageModel): AIProvider {
  const modelId = (model as any).modelId || '';
  const provider = (model as any).provider || '';

  if (modelId.includes('claude') || provider === 'anthropic' || provider.includes('anthropic')) {
    return 'anthropic';
  }
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3') || provider === 'openai' || provider.includes('openai')) {
    return 'openai';
  }
  if (modelId.includes('gemini') || provider === 'google' || provider.includes('google')) {
    return 'google';
  }
  return 'unknown';
}

/**
 * Get provider-specific options for prompt caching and model behavior
 * - Anthropic: Uses explicit cache_control with ephemeral type
 * - OpenAI: Automatic caching for prompts >1024 tokens + reasoning_effort for o1/o3 models
 * - Google: Different caching paradigm (not implemented here)
 */
export function getProviderCacheOptions(provider: AIProvider): object {
  if (provider === 'anthropic') {
    return {
      experimental_providerMetadata: {
        anthropic: {
          cacheControl: { type: 'ephemeral' }
        }
      }
    };
  }

  if (provider === 'openai') {
    const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || 'low';
    const validEfforts = ['low', 'medium', 'high'];

    if (!validEfforts.includes(reasoningEffort)) {
      console.warn(`⚠️  Invalid OPENAI_REASONING_EFFORT value '${reasoningEffort}'. Using 'low'. Valid values: ${validEfforts.join(', ')}`);
    }

    return {
      reasoning_effort: validEfforts.includes(reasoningEffort) ? reasoningEffort : 'low'
    };
  }

  // Google: no special options needed
  return {};
}

/**
 * Get the AI model based on provider preference
 */
export function getModel(provider: string | null) {
  // Provider configuration
  const providerConfig = {
    google: {
      apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
      modelEnv: 'GOOGLE_MODEL',
      defaultModel: 'gemini-3-flash-preview',
      factory: google,
      displayName: 'Google'
    },
    openai: {
      apiKeyEnv: 'OPENAI_API_KEY',
      modelEnv: 'OPENAI_MODEL',
      defaultModel: 'gpt-5-mini',
      factory: openai,
      displayName: 'OpenAI'
    },
    anthropic: {
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      modelEnv: 'ANTHROPIC_MODEL',
      defaultModel: 'claude-sonnet-4-20250514',
      factory: anthropic,
      displayName: 'Claude'
    }
  };

  // Determine which provider to use
  let selectedProvider: keyof typeof providerConfig;

  if (provider) {
    // Use explicitly specified provider
    if (!(provider in providerConfig)) {
      console.error(`❌ Invalid provider '${provider}'. Must be one of: ${Object.keys(providerConfig).join(', ')}`);
      process.exit(1);
    }
    selectedProvider = provider as keyof typeof providerConfig;
  } else {
    // Auto-detect based on environment variables (Priority: Google > OpenAI > Anthropic)
    const detectedProvider = (['google', 'openai', 'anthropic'] as const).find(
      p => process.env[providerConfig[p].apiKeyEnv]
    );

    if (!detectedProvider) {
      console.error("❌ No API key found. Set either ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY in .env file");
      process.exit(1);
    }
    selectedProvider = detectedProvider;
  }

  // Create the model using the selected provider
  const config = providerConfig[selectedProvider];

  if (!process.env[config.apiKeyEnv]) {
    console.error(`❌ ${config.apiKeyEnv} not set in .env file`);
    process.exit(1);
  }

  const modelId = process.env[config.modelEnv] || config.defaultModel;
  const model = config.factory(modelId);
  const modelName = `${config.displayName} (${modelId})`;

  return { model, modelName };
}

// Configuration for token efficiency optimizations
export const TOKEN_OPTIMIZATION = {
  MAX_TOOL_RESULT_LENGTH: 1000,   // Truncate tool results longer than this
  TRUNCATION_SUFFIX: '\n\n[...content truncated for efficiency]',
  // Only truncate results from these tools (query results, not context/schema)
  TOOLS_TO_TRUNCATE: new Set(['queryVCData'])
};



/**
 * Parse command-line arguments
 */
export function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    provider: null as string | null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('--provider=')) {
      // Handle --provider=openai format (preferred)
      options.provider = arg.split('=')[1].toLowerCase();
    } else if (arg === '--provider' || arg === '-p') {
      // Handle --provider openai format (legacy support)
      if (i + 1 < args.length) {
        options.provider = args[i + 1].toLowerCase();
        i++; // Skip next arg since we consumed it
      } else {
        console.error('❌ --provider requires a value (openai, anthropic, or google)');
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
    Usage: npm run dev [options]

    Options:
      -v, --verbose              Enable verbose logging (default: false)
      --provider=<name>          Specify AI provider: openai, anthropic, or google
                                (default: auto-detect based on environment variables)
      -h, --help                 Show this help message

    Examples:
      npm run dev
      npm run dev -- --provider=openai
      npm run dev -- -v
      npm run dev -- --provider=google -v
        `);
      process.exit(0);
    }
  }

  return options;
}
