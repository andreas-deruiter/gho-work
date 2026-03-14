/**
 * Integration tests: Plugin lifecycle using real PluginServiceImpl
 * with mocked external dependencies (fetcher, installer, skill registration,
 * config store, settings store).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PluginServiceImpl } from '../../packages/connectors/src/node/pluginServiceImpl.js';
import type { PluginSkillRegistration, PluginSettingsStore } from '../../packages/connectors/src/common/pluginService.js';
import type { CatalogEntry } from '@gho-work/base';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCatalogEntry(overrides?: Partial<CatalogEntry>): CatalogEntry {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    location: 'https://github.com/test/test-plugin',
    hasSkills: true,
    hasMcpServers: false,
    ...overrides,
  };
}

function makeSettingsStore(): PluginSettingsStore & { _store: Map<string, string> } {
  const _store = new Map<string, string>();
  return {
    _store,
    get(key: string) {
      return _store.get(key);
    },
    set(key: string, value: string) {
      _store.set(key, value);
    },
  };
}

function makeSkillRegistration(): PluginSkillRegistration {
  return {
    addSource: vi.fn(),
    removeSource: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConfigStore() {
  return {
    addServer: vi.fn().mockResolvedValue(undefined),
    removeServer: vi.fn().mockResolvedValue(undefined),
    getServers: vi.fn().mockReturnValue([]),
    getServer: vi.fn().mockReturnValue(undefined),
    onDidChange: { event: vi.fn() },
    dispose: vi.fn(),
  };
}

function makeFetcher(entries: CatalogEntry[]) {
  return {
    fetch: vi.fn().mockResolvedValue(entries),
  };
}

function makeInstaller() {
  return {
    getCachePath: vi.fn().mockReturnValue('/tmp/plugin-cache/test-plugin/1.0.0'),
    checkGitAvailable: vi.fn().mockResolvedValue(undefined),
    clonePlugin: vi.fn().mockResolvedValue(undefined),
    parseManifest: vi.fn().mockResolvedValue({ skills: 'skills/', mcpServers: undefined }),
    parseMcpServers: vi.fn().mockResolvedValue(new Map()),
    countSkills: vi.fn().mockResolvedValue(3),
    countAgents: vi.fn().mockResolvedValue(0),
    deleteCache: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginServiceImpl — catalog', () => {
  let fetcher: ReturnType<typeof makeFetcher>;
  let installer: ReturnType<typeof makeInstaller>;
  let skillReg: PluginSkillRegistration;
  let configStore: ReturnType<typeof makeConfigStore>;
  let settings: ReturnType<typeof makeSettingsStore>;
  let service: PluginServiceImpl;

  const catalogEntries: CatalogEntry[] = [
    makeCatalogEntry({ name: 'plugin-a', version: '1.0.0' }),
    makeCatalogEntry({ name: 'plugin-b', version: '2.0.0' }),
  ];

  beforeEach(() => {
    fetcher = makeFetcher(catalogEntries);
    installer = makeInstaller();
    skillReg = makeSkillRegistration();
    configStore = makeConfigStore();
    settings = makeSettingsStore();
    service = new PluginServiceImpl(fetcher, installer, skillReg, configStore, settings);
  });

  afterEach(() => {
    service.dispose();
  });

  it('getCachedCatalog() returns empty array initially', () => {
    const result = service.getCachedCatalog();
    expect(result).toEqual([]);
  });

  it('fetchCatalog() returns entries from fetcher', async () => {
    const result = await service.fetchCatalog();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('plugin-a');
    expect(result[1].name).toBe('plugin-b');
  });

  it('fetchCatalog() calls fetcher.fetch() once', async () => {
    await service.fetchCatalog();
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetchCatalog() caches entries — second call does not re-fetch', async () => {
    await service.fetchCatalog();
    await service.fetchCatalog();
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetchCatalog(true) forces re-fetch even when cache is populated', async () => {
    await service.fetchCatalog();
    await service.fetchCatalog(true);
    expect(fetcher.fetch).toHaveBeenCalledTimes(2);
  });

  it('getCachedCatalog() returns entries after a fetch', async () => {
    await service.fetchCatalog();
    const cached = service.getCachedCatalog();
    expect(cached).toHaveLength(2);
    expect(cached[0].name).toBe('plugin-a');
  });

  it('onDidChangeCatalog fires when catalog is fetched', async () => {
    const fired: CatalogEntry[][] = [];
    service.onDidChangeCatalog((entries) => fired.push(entries));

    await service.fetchCatalog();

    expect(fired).toHaveLength(1);
    expect(fired[0]).toHaveLength(2);
  });

  it('onDidChangeCatalog fires again on forceRefresh', async () => {
    const fired: CatalogEntry[][] = [];
    service.onDidChangeCatalog((entries) => fired.push(entries));

    await service.fetchCatalog();
    await service.fetchCatalog(true);

    expect(fired).toHaveLength(2);
  });

  it('onDidChangeCatalog does NOT fire when returning cached entries', async () => {
    await service.fetchCatalog();

    const fired: CatalogEntry[][] = [];
    service.onDidChangeCatalog((entries) => fired.push(entries));

    await service.fetchCatalog(); // returns cache, no fire
    expect(fired).toHaveLength(0);
  });

  it('fetchCatalog() saves catalog to settings store', async () => {
    await service.fetchCatalog();

    const saved = settings.get('plugin.catalog');
    expect(saved).toBeDefined();
    const parsed = JSON.parse(saved!) as CatalogEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('plugin-a');
  });
});

describe('PluginServiceImpl — installed plugins (initial state)', () => {
  let service: PluginServiceImpl;

  beforeEach(() => {
    service = new PluginServiceImpl(
      makeFetcher([]),
      makeInstaller(),
      makeSkillRegistration(),
      makeConfigStore(),
      makeSettingsStore(),
    );
  });

  afterEach(() => {
    service.dispose();
  });

  it('getInstalled() returns empty array initially', () => {
    expect(service.getInstalled()).toEqual([]);
  });

  it('getPlugin("nonexistent") returns undefined', () => {
    expect(service.getPlugin('nonexistent')).toBeUndefined();
  });
});

describe('PluginServiceImpl — settings restoration', () => {
  const catalogEntries: CatalogEntry[] = [
    makeCatalogEntry({ name: 'cached-plugin', version: '3.0.0' }),
  ];

  it('restores catalog from settings on construction', () => {
    const settings = makeSettingsStore();
    settings.set('plugin.catalog', JSON.stringify(catalogEntries));

    const service = new PluginServiceImpl(
      makeFetcher([]),
      makeInstaller(),
      makeSkillRegistration(),
      makeConfigStore(),
      settings,
    );

    const cached = service.getCachedCatalog();
    expect(cached).toHaveLength(1);
    expect(cached[0].name).toBe('cached-plugin');

    service.dispose();
  });

  it('does not re-fetch when catalog already cached in settings', async () => {
    const settings = makeSettingsStore();
    settings.set('plugin.catalog', JSON.stringify(catalogEntries));
    const fetcher = makeFetcher([]);

    const service = new PluginServiceImpl(
      fetcher,
      makeInstaller(),
      makeSkillRegistration(),
      makeConfigStore(),
      settings,
    );

    // Catalog is non-empty from settings, so fetchCatalog should return cached
    await service.fetchCatalog();
    expect(fetcher.fetch).not.toHaveBeenCalled();

    service.dispose();
  });

  it('handles malformed catalog JSON in settings gracefully', () => {
    const settings = makeSettingsStore();
    settings.set('plugin.catalog', 'not-valid-json');

    // Should not throw
    const service = new PluginServiceImpl(
      makeFetcher([]),
      makeInstaller(),
      makeSkillRegistration(),
      makeConfigStore(),
      settings,
    );

    expect(service.getCachedCatalog()).toEqual([]);
    service.dispose();
  });

  it('handles malformed installed JSON in settings gracefully', () => {
    const settings = makeSettingsStore();
    settings.set('plugin.installed', '{bad json}');

    // Should not throw
    const service = new PluginServiceImpl(
      makeFetcher([]),
      makeInstaller(),
      makeSkillRegistration(),
      makeConfigStore(),
      settings,
    );

    expect(service.getInstalled()).toEqual([]);
    service.dispose();
  });
});

describe('PluginServiceImpl — ${CLAUDE_PLUGIN_ROOT} expansion', () => {
  let mockInstaller: ReturnType<typeof makeInstaller>;
  let mockConfigStore: ReturnType<typeof makeConfigStore>;
  let service: PluginServiceImpl;

  const pluginCachePath = '/tmp/plugin-cache/test-plugin/1.0.0';

  beforeEach(() => {
    mockInstaller = makeInstaller();
    mockInstaller.getCachePath.mockReturnValue(pluginCachePath);
    mockInstaller.parseMcpServers.mockResolvedValue(
      new Map([
        [
          'lint-server',
          {
            command: '${CLAUDE_PLUGIN_ROOT}/bin/lint-mcp',
            args: ['--config', '${CLAUDE_PLUGIN_ROOT}/config.json'],
            env: { PLUGIN_HOME: '${CLAUDE_PLUGIN_ROOT}' },
            cwd: '${CLAUDE_PLUGIN_ROOT}',
          },
        ],
      ]),
    );

    const settings = makeSettingsStore();
    // Pre-load catalog so install() can find the plugin
    settings.set(
      'plugin.catalog',
      JSON.stringify([makeCatalogEntry({ name: 'test-plugin', version: '1.0.0' })]),
    );

    mockConfigStore = makeConfigStore();
    service = new PluginServiceImpl(
      makeFetcher([]),
      mockInstaller,
      makeSkillRegistration(),
      mockConfigStore,
      settings,
    );
  });

  afterEach(() => {
    service.dispose();
  });

  it('expands ${CLAUDE_PLUGIN_ROOT} in MCP server command during install', async () => {
    await service.install('test-plugin');

    expect(mockConfigStore.addServer).toHaveBeenCalledOnce();
    const [, config] = mockConfigStore.addServer.mock.calls[0];
    expect(config.command).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(config.command).toBe(`${pluginCachePath}/bin/lint-mcp`);
  });

  it('expands ${CLAUDE_PLUGIN_ROOT} in MCP server args during install', async () => {
    await service.install('test-plugin');

    const [, config] = mockConfigStore.addServer.mock.calls[0];
    expect(config.args[0]).toBe('--config');
    expect(config.args[1]).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(config.args[1]).toBe(`${pluginCachePath}/config.json`);
  });

  it('expands ${CLAUDE_PLUGIN_ROOT} in MCP server env and cwd during install', async () => {
    await service.install('test-plugin');

    const [, config] = mockConfigStore.addServer.mock.calls[0];
    expect(config.env.PLUGIN_HOME).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(config.env.PLUGIN_HOME).toBe(pluginCachePath);
    expect(config.cwd).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    expect(config.cwd).toBe(pluginCachePath);
  });
});
