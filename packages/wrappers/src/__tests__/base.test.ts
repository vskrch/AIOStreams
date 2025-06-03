import { describe, it, expect } from 'vitest';
import { BaseWrapper } from '../base';
import type { Config } from '@aiostreams/types';

class TestWrapper extends BaseWrapper {
  constructor() {
    const cfg = {
      resolutions: [],
      qualities: [],
      visualTags: [],
      audioTags: [],
      encodes: [],
      sortBy: [],
      streamTypes: [],
      onlyShowCachedStreams: false,
      prioritisedLanguages: null,
      excludedLanguages: null,
      formatter: '',
    } as unknown as Config;
    super('test', 'http://example.com/manifest.json', 'test', cfg);
  }

  public parseSize(str: string, k = 1024) {
    return this.extractSizeInBytes(str, k);
  }
}

describe('extractSizeInBytes', () => {
  const wrapper = new TestWrapper();
  it('parses KB/MB/GB/TB values', () => {
    expect(wrapper.parseSize('1KB')).toBe(1024);
    expect(wrapper.parseSize('1.5 MB')).toBe(1.5 * 1024 * 1024);
    expect(wrapper.parseSize('2GB')).toBe(2 * 1024 * 1024 * 1024);
    expect(wrapper.parseSize('3 TB')).toBe(3 * 1024 ** 4);
  });

  it('returns 0 when no match', () => {
    expect(wrapper.parseSize('unknown')).toBe(0);
  });
});
