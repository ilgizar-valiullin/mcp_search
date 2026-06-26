import { logger } from '../utils/logger.js';

type Intent = 'web' | 'docs' | 'github' | 'news';

export interface ClassifierResult {
  intent: Intent;
  language?: string;
}

type Pipeline = (
  text: string,
  labels: string[],
  options?: { hypothesis_template?: string; multi_label?: boolean },
) => Promise<{ labels: string[]; scores: number[] }>;

const NLI_LABELS = [
  'code repositories',
  'developer documentation',
  'technology industry news',
  'non-technical everyday topics',
] as const;

const LABEL_TO_INTENT: Record<string, Intent> = {
  'code repositories': 'github',
  'developer documentation': 'docs',
  'technology industry news': 'news',
  'non-technical everyday topics': 'web',
};

const LANG_MAP: Record<string, string> = {
  'c++': 'cpp',
  cpp: 'cpp',
  python: 'python',
  rust: 'rust',
  javascript: 'javascript',
  js: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  go: 'go',
  golang: 'go',
  java: 'java',
  swift: 'swift',
  kotlin: 'kotlin',
  ruby: 'ruby',
  php: 'php',
};

export class IntentClassifier {
  private classifier: Pipeline | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly modelName: string;
  private readonly minScore: number;

  constructor(modelName: string = 'Xenova/nli-deberta-v3-xsmall', minScore: number = 0.45, pipeline?: Pipeline) {
    this.modelName = modelName;
    this.minScore = minScore;
    if (pipeline) this.classifier = pipeline;
  }

  async classify(query: string): Promise<ClassifierResult> {
    const classifier = await this.getPipeline();
    if (!classifier) return { intent: 'web' };

    try {
      const result = await classifier(query, [...NLI_LABELS], {
        hypothesis_template: 'This text is about {}',
        multi_label: false,
      });

      const bestLabel = result.labels[0];
      const bestScore = result.scores[0];

      logger.debug(
        {
          query,
          scores: result.labels.map((l, i) => `${l}=${result.scores[i].toFixed(3)}`).join(', '),
          bestLabel,
          bestScore: bestScore.toFixed(3),
        },
        'Intent NLI scores',
      );

      if (bestScore < this.minScore) return { intent: 'web' };

      const intent = LABEL_TO_INTENT[bestLabel] || 'web';
      const metadata: ClassifierResult = { intent };

      if (intent === 'github') {
        metadata.language = this.extractLanguage(query);
      }

      return metadata;
    } catch (err) {
      logger.error({ err, query }, 'NLI classification failed, falling back to web');
      return { intent: 'web' };
    }
  }

  async classifyFreshness(query: string): Promise<boolean> {
    const classifier = await this.getPipeline();
    if (!classifier) return false;

    try {
      const result = await classifier(query, [
        'The user request implies a need for recent information, updates, latest versions, or news.',
      ]);
      const freshnessScore = result.scores[0];
      const requiresFreshness = freshnessScore > 0.45;

      logger.debug(
        { query, freshnessScore: freshnessScore.toFixed(3), requiresFreshness },
        'Freshness NLI check',
      );

      return requiresFreshness;
    } catch (err) {
      logger.error({ err, query }, 'Freshness NLI classification failed, defaulting to false');
      return false;
    }
  }

  async scoreEntailment(query: string, text: string): Promise<number> {
    const classifier = await this.getPipeline();
    if (!classifier || !text) return 0.5;

    try {
      const result = await classifier(text.substring(0, 512), [query], {
        hypothesis_template: 'This text is about {}',
        multi_label: false,
      });
      return result.scores[0];
    } catch {
      return 0.5;
    }
  }

  private extractLanguage(query: string): string | undefined {
    const lower = query.toLowerCase();
    for (const [key, val] of Object.entries(LANG_MAP)) {
      if (lower.includes(key)) return val;
    }
    return undefined;
  }

  private async getPipeline(): Promise<Pipeline | null> {
    if (this.classifier) return this.classifier;
    if (this.initPromise) {
      await this.initPromise;
      return this.classifier;
    }

    this.initPromise = this.init();
    await this.initPromise;
    return this.classifier;
  }

  private async init(): Promise<void> {
    try {
      logger.info({ model: this.modelName }, 'Loading NLI model for intent classification');
      const { pipeline } = await import('@xenova/transformers');
      this.classifier = (await pipeline('zero-shot-classification', this.modelName)) as unknown as Pipeline;
      logger.info({ model: this.modelName }, 'NLI model loaded');
    } catch (err) {
      logger.error({ err, model: this.modelName }, 'Failed to load NLI model, intent classification disabled');
    }
  }
}
