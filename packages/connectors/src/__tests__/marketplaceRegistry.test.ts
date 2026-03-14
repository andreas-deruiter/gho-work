import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketplaceRegistryImpl } from '../node/marketplaceRegistryImpl.js';
import type { CatalogEntry } from '@gho-work/base';

describe('MarketplaceRegistryImpl', () => {
  let registry: MarketplaceRegistryImpl;
  let mockFetcherFactory: ReturnType<typeof vi.fn>;
  let mockSettings: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFetcherFactory = vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue([]),
    });
    mockSettings = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() };
    registry = new MarketplaceRegistryImpl(mockFetcherFactory, mockSettings);
  });

  it('has the official marketplace pre-configured', () => {
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('official');
  });

  it('adds a new marketplace by github source', async () => {
    const entry = await registry.add({ type: 'github', repo: 'team/plugins' });
    expect(entry.name).toBe('team/plugins');
    expect(registry.list()).toHaveLength(2);
  });

  it('removes a marketplace', async () => {
    await registry.add({ type: 'github', repo: 'team/plugins' });
    await registry.remove('team/plugins');
    expect(registry.list()).toHaveLength(1);
  });

  it('cannot remove the official marketplace', async () => {
    await expect(registry.remove('official')).rejects.toThrow();
  });

  it('prevents duplicate marketplace names', async () => {
    await registry.add({ type: 'github', repo: 'team/plugins' });
    await expect(registry.add({ type: 'github', repo: 'team/plugins' })).rejects.toThrow(/already exists/);
  });

  it('fetches and merges plugins from all marketplaces', async () => {
    const plugin: CatalogEntry = {
      name: 'test-plugin',
      description: 'A test plugin',
      location: { type: 'github', repo: 'test/plugin' },
      hasSkills: true,
      hasMcpServers: false,
      hasCommands: false,
      hasAgents: false,
      hasHooks: false,
    };
    mockFetcherFactory.mockReturnValue({
      fetch: vi.fn().mockResolvedValue([plugin]),
    });

    const allPlugins = await registry.fetchAll();
    expect(allPlugins.length).toBeGreaterThanOrEqual(1);
  });

  it('persists non-default marketplaces to settings', async () => {
    await registry.add({ type: 'url', url: 'https://example.com/marketplace.json' });
    expect(mockSettings.set).toHaveBeenCalledWith('plugin.marketplaces', expect.any(Array));
  });

  it('loads saved marketplaces from settings', () => {
    mockSettings.get.mockReturnValue([
      { name: 'team', source: { type: 'github', repo: 'team/plugins' } },
    ]);
    const registry2 = new MarketplaceRegistryImpl(mockFetcherFactory, mockSettings);
    expect(registry2.list()).toHaveLength(2); // official + team
  });
});
