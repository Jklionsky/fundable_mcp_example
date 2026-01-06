import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

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
      } else if (arg === '--provider' || arg === '-p') {
        // Next argument should be the provider name
        if (i + 1 < args.length) {
          options.provider = args[i + 1].toLowerCase();
          i++; // Skip next arg since we consumed it
        } else {
          console.error('❌ --provider requires a value (openai, anthropic, or google)');
          process.exit(1);
        }
      } else if (arg === '--help' || arg === '-h') {
        console.log(`
  Usage: npm start [options]
  
  Options:
    -v, --verbose           Enable verbose logging (default: false)
    -p, --provider <name>   Specify AI provider: openai, anthropic, or google
                            (default: auto-detect based on environment variables)
    -h, --help              Show this help message
  
  Examples:
    npm start --verbose
    npm start --provider openai
    npm start -v -p google
        `);
        process.exit(0);
      }
    }
  
    return options;
  }
  