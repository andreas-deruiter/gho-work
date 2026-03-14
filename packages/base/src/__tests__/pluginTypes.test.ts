/**
 * Type-level construction tests for plugin types.
 * These tests verify that all valid shapes of each type can be constructed
 * and that the discriminated union variants work correctly.
 */

import { describe, it, expect } from 'vitest';
import type {
  CatalogEntry,
  InstalledPlugin,
  PluginLocation,
  InstallProgressStatus,
} from '../common/pluginTypes.js';

describe('InstallProgressStatus', () => {
  it('accepts all valid status values', () => {
    const statuses: InstallProgressStatus[] = [
      'downloading',
      'extracting',
      'registering',
      'done',
      'error',
    ];
    expect(statuses).toHaveLength(5);
  });
});

describe('PluginLocation', () => {
  it('can be constructed as github variant', () => {
    const location: PluginLocation = {
      type: 'github',
      repo: 'owner/repo',
    };
    expect(location.type).toBe('github');
    expect((location as Extract<PluginLocation, { type: 'github' }>).repo).toBe('owner/repo');
  });

  it('can be constructed as github variant with optional ref', () => {
    const location: PluginLocation = {
      type: 'github',
      repo: 'owner/repo',
      ref: 'v1.0.0',
    };
    expect((location as Extract<PluginLocation, { type: 'github' }>).ref).toBe('v1.0.0');
  });

  it('can be constructed as url variant', () => {
    const location: PluginLocation = {
      type: 'url',
      url: 'https://example.com/plugin.zip',
    };
    expect(location.type).toBe('url');
    expect((location as Extract<PluginLocation, { type: 'url' }>).url).toBe('https://example.com/plugin.zip');
  });

  it('can be constructed as url variant with optional ref', () => {
    const location: PluginLocation = {
      type: 'url',
      url: 'https://example.com/plugin.git',
      ref: 'main',
    };
    expect((location as Extract<PluginLocation, { type: 'url' }>).ref).toBe('main');
  });

  it('can be constructed as git-subdir variant', () => {
    const location: PluginLocation = {
      type: 'git-subdir',
      url: 'https://github.com/owner/monorepo.git',
      path: 'packages/my-plugin',
    };
    expect(location.type).toBe('git-subdir');
    const typed = location as Extract<PluginLocation, { type: 'git-subdir' }>;
    expect(typed.url).toBe('https://github.com/owner/monorepo.git');
    expect(typed.path).toBe('packages/my-plugin');
  });

  it('can be constructed as git-subdir variant with optional ref', () => {
    const location: PluginLocation = {
      type: 'git-subdir',
      url: 'https://github.com/owner/monorepo.git',
      path: 'packages/my-plugin',
      ref: 'v2.0.0',
    };
    expect((location as Extract<PluginLocation, { type: 'git-subdir' }>).ref).toBe('v2.0.0');
  });

  it('discriminated union narrows correctly', () => {
    function checkLocation(location: PluginLocation): void {
      if (location.type === 'github') {
        expect(location.repo).toBeDefined();
      } else if (location.type === 'url') {
        expect(location.url).toBeDefined();
      } else {
        // git-subdir
        expect(location.url).toBeDefined();
        expect(location.path).toBeDefined();
      }
    }

    checkLocation({ type: 'github', repo: 'owner/repo' });
    checkLocation({ type: 'url', url: 'https://example.com/plugin.zip' });
    checkLocation({ type: 'git-subdir', url: 'https://github.com/owner/repo.git', path: 'plugins/my-plugin' });
  });
});

describe('CatalogEntry', () => {
  it('can be constructed with minimal required fields', () => {
    const entry: CatalogEntry = {
      name: 'my-plugin',
      description: 'A test plugin',
      version: '1.0.0',
      location: 'https://github.com/owner/my-plugin',
      hasSkills: true,
      hasMcpServers: false,
    };
    expect(entry.name).toBe('my-plugin');
    expect(entry.hasSkills).toBe(true);
    expect(entry.hasMcpServers).toBe(false);
  });

  it('can be constructed with string location', () => {
    const entry: CatalogEntry = {
      name: 'plugin-a',
      description: 'Plugin A',
      version: '0.1.0',
      location: 'https://github.com/owner/plugin-a',
      hasSkills: false,
      hasMcpServers: true,
    };
    expect(typeof entry.location).toBe('string');
  });

  it('can be constructed with PluginLocation object', () => {
    const location: PluginLocation = { type: 'github', repo: 'owner/plugin-b' };
    const entry: CatalogEntry = {
      name: 'plugin-b',
      description: 'Plugin B',
      version: '2.0.0',
      location,
      hasSkills: true,
      hasMcpServers: true,
    };
    expect(typeof entry.location).toBe('object');
  });

  it('can be constructed with all optional fields', () => {
    const entry: CatalogEntry = {
      name: 'full-plugin',
      description: 'A fully specified plugin',
      version: '3.0.0',
      author: { name: 'Jane Doe', email: 'jane@example.com' },
      location: { type: 'url', url: 'https://example.com/plugin.zip' },
      keywords: ['productivity', 'mcp'],
      category: 'tools',
      hasSkills: true,
      hasMcpServers: true,
    };
    expect(entry.author?.name).toBe('Jane Doe');
    expect(entry.author?.email).toBe('jane@example.com');
    expect(entry.keywords).toEqual(['productivity', 'mcp']);
    expect(entry.category).toBe('tools');
  });

  it('can be constructed with author without email', () => {
    const entry: CatalogEntry = {
      name: 'plugin-c',
      description: 'Plugin C',
      version: '1.0.0',
      author: { name: 'John Doe' },
      location: 'https://github.com/owner/plugin-c',
      hasSkills: false,
      hasMcpServers: false,
    };
    expect(entry.author?.email).toBeUndefined();
  });
});

describe('InstalledPlugin', () => {
  it('can be constructed with all required fields', () => {
    const catalogEntry: CatalogEntry = {
      name: 'installed-plugin',
      description: 'An installed plugin',
      version: '1.0.0',
      location: { type: 'github', repo: 'owner/installed-plugin' },
      hasSkills: true,
      hasMcpServers: true,
    };

    const installed: InstalledPlugin = {
      name: 'installed-plugin',
      version: '1.0.0',
      enabled: true,
      cachePath: '/home/user/.cache/gho-work/plugins/installed-plugin',
      installedAt: '2026-03-14T00:00:00.000Z',
      catalogMeta: catalogEntry,
      skillCount: 3,
      agentCount: 0,
      mcpServerNames: ['server-a', 'server-b'],
    };

    expect(installed.name).toBe('installed-plugin');
    expect(installed.enabled).toBe(true);
    expect(installed.skillCount).toBe(3);
    expect(installed.mcpServerNames).toHaveLength(2);
  });

  it('can be constructed with disabled state', () => {
    const catalogEntry: CatalogEntry = {
      name: 'disabled-plugin',
      description: 'A disabled plugin',
      version: '0.5.0',
      location: 'https://example.com/disabled.zip',
      hasSkills: false,
      hasMcpServers: false,
    };

    const installed: InstalledPlugin = {
      name: 'disabled-plugin',
      version: '0.5.0',
      enabled: false,
      cachePath: '/home/user/.cache/gho-work/plugins/disabled-plugin',
      installedAt: '2026-01-01T00:00:00.000Z',
      catalogMeta: catalogEntry,
      skillCount: 0,
      agentCount: 0,
      mcpServerNames: [],
    };

    expect(installed.enabled).toBe(false);
    expect(installed.mcpServerNames).toHaveLength(0);
  });
});
