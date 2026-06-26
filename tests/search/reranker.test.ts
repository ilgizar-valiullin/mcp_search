import { describe, it, expect } from 'vitest';
import { normalizeUrl, deduplicateResults, domainScore, calculateImplicitFreshness, positionScore, rerankResults } from '../../src/search/reranker.js';
import type { ProviderResult } from '../../src/utils/types.js';

describe('normalizeUrl', () => {
  it('should remove www prefix', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('https://example.com/page');
  });

  it('should remove trailing slash', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
  });

  it('should remove utm parameters', () => {
    const result = normalizeUrl('https://example.com/page?utm_source=twitter&id=1');
    expect(result).not.toContain('utm_source');
    expect(result).toContain('id=1');
  });

  it('should remove hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });
});

describe('deduplicateResults', () => {
  it('should remove duplicates with the same URL', () => {
    const results: ProviderResult[] = [
      { title: 'A', url: 'https://example.com/a', snippet: 'a', raw_position: 1, provider: 'p1' },
      { title: 'B', url: 'https://example.com/a', snippet: 'a', raw_position: 5, provider: 'p2' },
    ];
    expect(deduplicateResults(results)).toHaveLength(1);
  });

  it('should keep best position for duplicates', () => {
    const results: ProviderResult[] = [
      { title: 'A', url: 'https://example.com/a', snippet: 'a', raw_position: 5, provider: 'p1' },
      { title: 'B', url: 'https://example.com/a', snippet: 'a', raw_position: 1, provider: 'p2' },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].raw_position).toBe(1);
  });
});

describe('domainScore', () => {
  it('should give high score to official docs', () => {
    expect(domainScore('https://developer.mozilla.org/en-US/')).toBeGreaterThan(0.9);
  });

  it('should give high score to github', () => {
    expect(domainScore('https://github.com/org/repo')).toBe(0.95);
  });

  it('should give medium score to stackoverflow', () => {
    expect(domainScore('https://stackoverflow.com/questions/1')).toBe(0.80);
  });

  it('should return default for unknown domains', () => {
    expect(domainScore('https://example.com/page')).toBe(0.50);
  });
});

describe('calculateImplicitFreshness', () => {
  it('should return 1.0 for missing date', () => {
    expect(calculateImplicitFreshness(null, false)).toBe(1.0);
    expect(calculateImplicitFreshness(undefined, true)).toBe(1.0);
  });

  it('should return 1.0 for recent content (requiresFreshness=false)', () => {
    const recent = new Date(Date.now() - 1000 * 3600).toISOString();
    expect(calculateImplicitFreshness(recent, false)).toBe(1.0);
  });

  it('should return 1.0 for recent content (requiresFreshness=true)', () => {
    const recent = new Date(Date.now() - 1000 * 3600).toISOString();
    expect(calculateImplicitFreshness(recent, true)).toBe(1.0);
  });

  it('should decay old content when requiresFreshness=true', () => {
    const old = new Date('2020-01-01').toISOString();
    expect(calculateImplicitFreshness(old, true)).toBe(0.0);
  });

  it('should plateau for recent years when requiresFreshness=false', () => {
    const twoYearsAgo = new Date('2024-06-01').toISOString();
    expect(calculateImplicitFreshness(twoYearsAgo, false)).toBe(1.0);
  });
});

describe('positionScore', () => {
  it('should give 1.0 for first position', () => {
    expect(positionScore(1, 10)).toBeCloseTo(0.91, 1);
  });

  it('should give minimum score for last position', () => {
    const score = positionScore(10, 10);
    expect(score).toBeGreaterThanOrEqual(0.1);
    expect(score).toBeLessThan(0.2);
  });
});

describe('rerankResults', () => {
  it('should sort by relevance_score descending', () => {
    const results: ProviderResult[] = [
      { title: 'A', url: 'https://medium.com/a', snippet: 'a', raw_position: 1, provider: 'p1' },
      { title: 'B', url: 'https://github.com/b', snippet: 'b', raw_position: 2, provider: 'p2' },
      { title: 'C', url: 'https://stackoverflow.com/c', snippet: 'c', raw_position: 3, provider: 'p3' },
    ];

    const reranked = rerankResults(results);
    expect(reranked).toHaveLength(3);
    expect(reranked[0].relevance_score).toBeGreaterThanOrEqual(reranked[1].relevance_score);
  });
});
