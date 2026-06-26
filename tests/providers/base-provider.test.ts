import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseProvider } from '../../src/search/providers/base-provider.js';
import { ProviderOptions, ProviderResult } from '../../src/utils/types.js';

class DummyProvider extends BaseProvider {
  readonly name = 'Dummy';
  readonly tier = 1;

  doSearchFn = vi.fn<(query: string, options: ProviderOptions) => Promise<ProviderResult[]>>();

  async doSearch(query: string, options: ProviderOptions): Promise<ProviderResult[]> {
    return this.doSearchFn(query, options);
  }
}

describe('BaseProvider', () => {
  let provider: DummyProvider;

  beforeEach(() => {
    provider = new DummyProvider();
  });

  const dummyOptions: ProviderOptions = {
    intent: 'web',
    freshness: 'any',
    max_results: 10,
  };

  const dummyResults: ProviderResult[] = [
    {
      title: 'Test',
      url: 'https://test.com',
      snippet: 'Test snippet',
      raw_position: 1,
      provider: 'Dummy',
    },
  ];

  it('should start healthy', async () => {
    expect(await provider.healthCheck()).toBe(true);
    const stats = provider.getStats();
    expect(stats.healthy).toBe(true);
    expect(stats.requests_today).toBe(0);
  });

  it('should record success and update latency', async () => {
    provider.doSearchFn.mockResolvedValueOnce(dummyResults);

    const results = await provider.search('test query', dummyOptions);
    expect(results).toEqual(dummyResults);

    const stats = provider.getStats();
    expect(stats.requests_today).toBe(1);
    expect(stats.healthy).toBe(true);
    expect(stats.avg_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should track consecutive errors without blocking provider', async () => {
    const error = new Error('API down');
    provider.doSearchFn.mockRejectedValue(error);

    // All calls reach doSearch regardless of error count
    for (let i = 0; i < 5; i++) {
      await expect(provider.search('test', dummyOptions)).rejects.toThrow('API down');
      expect(await provider.healthCheck()).toBe(true);
    }

    // Consecutive errors counter keeps incrementing
    const stats = provider.getStats();
    expect(stats.healthy).toBe(true);
  });

  it('should serialise concurrent requests (no overlapping doSearch)', async () => {
    const active: number[] = [];
    const maxConcurrent: number[] = [0];

    provider.doSearchFn.mockImplementation(async () => {
      const id = active.length;
      active.push(id);
      maxConcurrent[0] = Math.max(maxConcurrent[0], active.length);
      await new Promise((r) => setTimeout(r, 20));
      active.pop();
      return dummyResults;
    });

    const results = await Promise.all([
      provider.search('q1', dummyOptions),
      provider.search('q2', dummyOptions),
      provider.search('q3', dummyOptions),
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(dummyResults);
    expect(maxConcurrent[0]).toBe(1);
    // doSearch calls are serialised — q1's doSearch completes before q2's starts
    expect(provider.doSearchFn).toHaveBeenNthCalledWith(1, 'q1', dummyOptions);
    expect(provider.doSearchFn).toHaveBeenNthCalledWith(2, 'q2', dummyOptions);
    expect(provider.doSearchFn).toHaveBeenNthCalledWith(3, 'q3', dummyOptions);
  });

  it('should always call doSearch even after many errors', async () => {
    const error = new Error('API down');
    provider.doSearchFn.mockRejectedValue(error);

    const results = await Promise.allSettled([
      provider.search('q1', dummyOptions),
      provider.search('q2', dummyOptions),
      provider.search('q3', dummyOptions),
      provider.search('q4', dummyOptions),
    ]);

    // All 4 calls reach doSearch and fail with the same API error
    for (let i = 0; i < 4; i++) {
      expect(results[i].status).toBe('rejected');
      if (results[i].status === 'rejected') {
        expect((results[i] as PromiseRejectedResult).reason.message).toBe('API down');
      }
    }
    expect(provider.doSearchFn).toHaveBeenCalledTimes(4);
  });
});
