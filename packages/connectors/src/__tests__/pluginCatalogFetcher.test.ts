import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CatalogEntry, PluginLocation } from '@gho-work/base';
import { PluginCatalogFetcher } from '../node/pluginCatalogFetcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKETPLACE_REPO_URL = 'https://github.com/anthropics/claude-plugins-official';
const DEFAULT_URL =
  'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json';

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FULL_PLUGIN = {
  name: 'sentry',
  description: 'Fix production issues faster with Sentry error context.',
  version: '1.2.0',
  author: { name: 'Sentry', email: 'support@sentry.io' },
  source: 'sentry',
  keywords: ['debugging', 'errors'],
  category: 'Integrations',
  skills: ['skills/'],
  commands: ['commands/'],
  mcpServers: { 'sentry-server': { command: 'npx', args: ['-y', 'sentry-mcp'] } },
};

const SKILLS_ONLY_PLUGIN = {
  name: 'my-skill-plugin',
  description: 'Skills only.',
  version: '0.1.0',
  source: 'my-skill-plugin',
  skills: ['skills/'],
};

const COMMANDS_ONLY_PLUGIN = {
  name: 'my-cmd-plugin',
  description: 'Commands only.',
  version: '0.1.0',
  source: 'my-cmd-plugin',
  commands: ['commands/'],
};

const MCP_ONLY_PLUGIN = {
  name: 'my-mcp-plugin',
  description: 'MCP only.',
  version: '0.1.0',
  source: 'my-mcp-plugin',
  mcpServers: { 'my-server': { command: 'npx', args: ['-y', 'my-mcp'] } },
};

const BARE_PLUGIN = {
  name: 'bare-plugin',
  description: 'No skills or MCP.',
  version: '0.0.1',
  source: 'bare-plugin',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginCatalogFetcher', () => {
  let fetcher: PluginCatalogFetcher;

  beforeEach(() => {
    fetcher = new PluginCatalogFetcher();
    vi.restoreAllMocks();
  });

  // --- Parsing ---

  it('parses marketplace.json with multiple plugins', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({
        metadata: { pluginRoot: 'plugins' },
        plugins: [FULL_PLUGIN, BARE_PLUGIN],
      }),
    ));

    const entries = await fetcher.fetch();
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('sentry');
    expect(entries[1].name).toBe('bare-plugin');
  });

  it('includes author, keywords, and category when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({
        plugins: [FULL_PLUGIN],
      }),
    ));

    const [entry] = await fetcher.fetch();
    expect(entry.author).toEqual({ name: 'Sentry', email: 'support@sentry.io' });
    expect(entry.keywords).toEqual(['debugging', 'errors']);
    expect(entry.category).toBe('Integrations');
  });

  // --- hasSkills ---

  it('sets hasSkills=true when skills field is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [SKILLS_ONLY_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasSkills).toBe(true);
  });

  it('sets hasSkills=true when commands field is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [COMMANDS_ONLY_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasSkills).toBe(true);
  });

  it('sets hasSkills=true when both skills and commands fields are present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [FULL_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasSkills).toBe(true);
  });

  it('sets hasSkills=false when neither skills nor commands field is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [BARE_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasSkills).toBe(false);
  });

  it('sets hasSkills=false when only mcpServers field is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [MCP_ONLY_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasSkills).toBe(false);
  });

  // --- hasMcpServers ---

  it('sets hasMcpServers=true when mcpServers field is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [FULL_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasMcpServers).toBe(true);
  });

  it('sets hasMcpServers=false when mcpServers field is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [BARE_PLUGIN] }),
    ));
    const [entry] = await fetcher.fetch();
    expect(entry.hasMcpServers).toBe(false);
  });

  // --- Error handling ---

  it('throws a user-friendly error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(fetcher.fetch()).rejects.toThrow(/Failed to fetch plugin catalog/);
  });

  it('throws on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeJsonResponse({}, 404)));
    await expect(fetcher.fetch()).rejects.toThrow(/404/);
  });

  it('throws on 500 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeJsonResponse({}, 500)));
    await expect(fetcher.fetch()).rejects.toThrow(/500/);
  });

  // --- Source / location resolution ---

  it('resolves bare string source to git-subdir with pluginRoot prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({
        metadata: { pluginRoot: 'plugins' },
        plugins: [FULL_PLUGIN], // source: 'sentry'
      }),
    ));

    const [entry] = await fetcher.fetch();
    const loc = entry.location as PluginLocation;
    expect(loc.type).toBe('git-subdir');
    if (loc.type === 'git-subdir') {
      expect(loc.path).toBe('plugins/sentry');
      expect(loc.url).toContain('anthropics/claude-plugins-official');
    }
  });

  it('resolves bare string source without pluginRoot to the bare path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({
        plugins: [BARE_PLUGIN], // source: 'bare-plugin', no pluginRoot
      }),
    ));

    const [entry] = await fetcher.fetch();
    const loc = entry.location as PluginLocation;
    expect(loc.type).toBe('git-subdir');
    if (loc.type === 'git-subdir') {
      expect(loc.path).toBe('bare-plugin');
    }
  });

  it('maps github source object to PluginLocation with type=github', async () => {
    const plugin = {
      ...BARE_PLUGIN,
      source: { source: 'github', repo: 'owner/my-plugin' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [plugin] }),
    ));

    const [entry] = await fetcher.fetch();
    const loc = entry.location as PluginLocation;
    expect(loc.type).toBe('github');
    if (loc.type === 'github') {
      expect(loc.repo).toBe('owner/my-plugin');
    }
  });

  it('maps url source object to PluginLocation with type=url', async () => {
    const plugin = {
      ...BARE_PLUGIN,
      source: { source: 'url', url: 'https://example.com/plugin.zip' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [plugin] }),
    ));

    const [entry] = await fetcher.fetch();
    const loc = entry.location as PluginLocation;
    expect(loc.type).toBe('url');
    if (loc.type === 'url') {
      expect(loc.url).toBe('https://example.com/plugin.zip');
    }
  });

  it('maps git-subdir source object to PluginLocation with type=git-subdir', async () => {
    const plugin = {
      ...BARE_PLUGIN,
      source: {
        source: 'git-subdir',
        url: 'https://github.com/org/monorepo',
        path: 'plugins/foo',
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [plugin] }),
    ));

    const [entry] = await fetcher.fetch();
    const loc = entry.location as PluginLocation;
    expect(loc.type).toBe('git-subdir');
    if (loc.type === 'git-subdir') {
      expect(loc.url).toBe('https://github.com/org/monorepo');
      expect(loc.path).toBe('plugins/foo');
    }
  });

  // --- Custom URL ---

  it('fetches from custom URL when provided', async () => {
    const customUrl = 'https://example.com/custom-marketplace.json';
    const mockFetch = vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [BARE_PLUGIN] }),
    );
    vi.stubGlobal('fetch', mockFetch);

    fetcher = new PluginCatalogFetcher(customUrl);
    await fetcher.fetch();

    expect(mockFetch).toHaveBeenCalledWith(customUrl);
  });

  it('fetches from default URL when no URL provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      makeJsonResponse({ plugins: [] }),
    );
    vi.stubGlobal('fetch', mockFetch);

    await fetcher.fetch();

    expect(mockFetch).toHaveBeenCalledWith(DEFAULT_URL);
  });
});
