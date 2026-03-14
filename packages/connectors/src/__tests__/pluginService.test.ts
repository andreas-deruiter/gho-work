import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { CatalogEntry } from '@gho-work/base';
import { PluginServiceImpl } from '../node/pluginServiceImpl.js';
import type { PluginSkillRegistration, PluginAgentRegistration, PluginSettingsStore } from '../common/pluginService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCatalogEntry(name: string): CatalogEntry {
  return {
    name,
    description: `${name} plugin`,
    version: '1.0.0',
    location: { type: 'github', repo: `owner/${name}` },
    hasSkills: true,
    hasMcpServers: false,
    hasCommands: false,
    hasAgents: false,
    hasHooks: false,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeSkillRegistration(): PluginSkillRegistration {
  return {
    addSource: vi.fn(),
    removeSource: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSettingsStore(): PluginSettingsStore {
  const data = new Map<string, string>();
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: string) => { data.set(key, value); }),
  };
}

function makeConfigStore() {
  const servers = new Map<string, unknown>();
  return {
    addServer: vi.fn().mockResolvedValue(undefined),
    removeServer: vi.fn().mockResolvedValue(undefined),
    getServers: vi.fn(() => servers),
    getServer: vi.fn((name: string) => servers.get(name)),
    onDidChangeServers: (_listener: unknown) => ({ dispose: () => {} }),
    updateServer: vi.fn().mockResolvedValue(undefined),
    getFilePath: vi.fn(() => '/mock/mcp.json'),
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
    getCachePath: vi.fn((_name: string, _version: string) => `/cache/${_name}/${_version}`),
    checkGitAvailable: vi.fn().mockResolvedValue(undefined),
    clonePlugin: vi.fn().mockResolvedValue(undefined),
    parseManifest: vi.fn().mockResolvedValue({ name: 'test', version: '1.0.0' }),
    parseMcpServers: vi.fn().mockResolvedValue(new Map()),
    countSkills: vi.fn().mockResolvedValue(3),
    countAgents: vi.fn().mockResolvedValue(0),
    countCommands: vi.fn().mockResolvedValue(0),
    deleteCache: vi.fn().mockResolvedValue(undefined),
    parseAgentFiles: vi.fn().mockResolvedValue([]),
  };
}

function makeAgentRegistration(): PluginAgentRegistration {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    unregisterPlugin: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginServiceImpl', () => {
  let service: PluginServiceImpl;
  let fetcher: ReturnType<typeof makeFetcher>;
  let installer: ReturnType<typeof makeInstaller>;
  let skillRegistration: PluginSkillRegistration;
  let configStore: ReturnType<typeof makeConfigStore>;
  let settings: PluginSettingsStore;

  beforeEach(() => {
    const entries = [makeCatalogEntry('sentry'), makeCatalogEntry('github-tools')];
    fetcher = makeFetcher(entries);
    installer = makeInstaller();
    skillRegistration = makeSkillRegistration();
    configStore = makeConfigStore();
    settings = makeSettingsStore();

    service = new PluginServiceImpl(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetcher as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      installer as any,
      skillRegistration,
      makeAgentRegistration(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configStore as any,
      settings,
    );
  });

  afterEach(() => {
    service.dispose();
  });

  // -------------------------------------------------------------------------
  // fetchCatalog
  // -------------------------------------------------------------------------

  describe('fetchCatalog()', () => {
    it('calls fetcher.fetch() and returns entries', async () => {
      const entries = await service.fetchCatalog();
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('sentry');
    });

    it('caches result — second call does not re-fetch', async () => {
      await service.fetchCatalog();
      await service.fetchCatalog();
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    });

    it('forceRefresh=true re-fetches even when cache is populated', async () => {
      await service.fetchCatalog();
      await service.fetchCatalog(true);
      expect(fetcher.fetch).toHaveBeenCalledTimes(2);
    });

    it('forceRefresh=false (explicit) uses cache', async () => {
      await service.fetchCatalog();
      await service.fetchCatalog(false);
      expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    });

    it('fires onDidChangeCatalog after a successful fetch', async () => {
      const received: CatalogEntry[][] = [];
      service.onDidChangeCatalog((entries) => { received.push(entries); });
      await service.fetchCatalog();
      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });

    it('fires onDidChangeCatalog on force-refresh', async () => {
      const received: CatalogEntry[][] = [];
      service.onDidChangeCatalog((entries) => { received.push(entries); });
      await service.fetchCatalog();
      await service.fetchCatalog(true);
      expect(received).toHaveLength(2);
    });

    it('does NOT fire onDidChangeCatalog when returning from cache', async () => {
      const received: CatalogEntry[][] = [];
      await service.fetchCatalog();
      service.onDidChangeCatalog((entries) => { received.push(entries); });
      await service.fetchCatalog(false);
      expect(received).toHaveLength(0);
    });

    it('persists fetched catalog to settings', async () => {
      await service.fetchCatalog();
      expect(settings.set).toHaveBeenCalledWith(
        'plugin.catalog',
        expect.any(String),
      );
      const serialized = (settings.set as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 'plugin.catalog',
      )?.[1];
      expect(serialized).toBeDefined();
      const parsed = JSON.parse(serialized as string) as CatalogEntry[];
      expect(parsed).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // getCachedCatalog
  // -------------------------------------------------------------------------

  describe('getCachedCatalog()', () => {
    it('returns empty array before any fetch', () => {
      const catalog = service.getCachedCatalog();
      expect(catalog).toEqual([]);
    });

    it('returns populated array after fetch', async () => {
      await service.fetchCatalog();
      expect(service.getCachedCatalog()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // getInstalled / getPlugin
  // -------------------------------------------------------------------------

  describe('getInstalled()', () => {
    it('returns empty array initially', () => {
      expect(service.getInstalled()).toEqual([]);
    });
  });

  describe('getPlugin()', () => {
    it('returns undefined for non-existent plugin', () => {
      expect(service.getPlugin('nonexistent')).toBeUndefined();
    });

    it('returns undefined before any installs', () => {
      expect(service.getPlugin('sentry')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Disposable
  // -------------------------------------------------------------------------

  it('can be disposed without error', () => {
    expect(() => service.dispose()).not.toThrow();
  });

  it('double-dispose does not throw', () => {
    service.dispose();
    expect(() => service.dispose()).not.toThrow();
  });
});
