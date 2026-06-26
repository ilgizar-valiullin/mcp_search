import { describe, it, expect } from 'vitest';
import { IntentClassifier } from '../../src/search/intent-classifier.js';

describe('IntentClassifier — NLI', () => {
  it('falls back to web when pipeline throws', async () => {
    const throwingPipeline = async () => { throw new Error('simulated failure'); };
    const classifier = new IntentClassifier('does-not-matter', 0.45, throwingPipeline);
    const result = await classifier.classify('anything');
    expect(result.intent).toBe('web');
  });

  it('returns intent when NLI score above threshold', async () => {
    const mockPipeline = async () => ({
      labels: [
        'code repositories',
        'developer documentation',
        'technology industry news',
        'non-technical everyday topics',
      ],
      scores: [0.85, 0.05, 0.05, 0.05],
    });

    const classifier = new IntentClassifier('mock-model', 0.45, mockPipeline);
    const result = await classifier.classify('github.com/react');
    expect(result.intent).toBe('github');
  });

  it('returns language metadata for github intent', async () => {
    const mockPipeline = async () => ({
      labels: [
        'code repositories',
        'developer documentation',
        'technology industry news',
        'non-technical everyday topics',
      ],
      scores: [0.85, 0.05, 0.05, 0.05],
    });

    const classifier = new IntentClassifier('mock-model', 0.45, mockPipeline);
    const result = await classifier.classify('python async await github');
    expect(result.intent).toBe('github');
    expect(result.language).toBe('python');
  });

  it('falls back to web when best score below minScore', async () => {
    const mockPipeline = async (_text: string, labels: string[]) => ({
      labels: [...labels],
      scores: labels.map(() => 0.1),
    });

    const classifier = new IntentClassifier('mock-model', 0.45, mockPipeline);
    const result = await classifier.classify('vague query');
    expect(result.intent).toBe('web');
  });
});
