import { describe, it, expect } from 'vitest';
import { buildSkillSources } from '../node/buildSkillSources.js';

describe('buildSkillSources', () => {
  it('returns only override path when overridePath is set', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      overridePath: '/test/skills',
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('override');
    expect(sources[0].basePath).toBe('/test/skills');
  });

  it('includes bundled and user paths by default', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      userPath: '/home/user/.gho-work/skills',
    });
    expect(sources).toHaveLength(2);
    expect(sources.find(s => s.id === 'bundled')?.basePath).toBe('/app/skills');
    expect(sources.find(s => s.id === 'user')?.basePath).toBe('/home/user/.gho-work/skills');
  });

  it('bundled has lowest priority, user has highest', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      userPath: '/home/user/.gho-work/skills',
    });
    const bundled = sources.find(s => s.id === 'bundled')!;
    const user = sources.find(s => s.id === 'user')!;
    expect(bundled.priority).toBeLessThan(user.priority);
  });

  it('includes additional paths with middle priority', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      userPath: '/home/user/.gho-work/skills',
      additionalPaths: ['/extra/skills'],
    });
    expect(sources).toHaveLength(3);
    const additional = sources.find(s => s.id === 'additional:0')!;
    expect(additional.basePath).toBe('/extra/skills');
    const bundled = sources.find(s => s.id === 'bundled')!;
    const user = sources.find(s => s.id === 'user')!;
    expect(additional.priority).toBeGreaterThan(bundled.priority);
    expect(additional.priority).toBeLessThan(user.priority);
  });

  it('includes marketplace plugins', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      installedPlugins: [
        {
          name: 'my-plugin',
          version: '1.0.0',
          enabled: true,
          cachePath: '/cache/official/my-plugin/1.0.0/skills',
          installedAt: '2026-01-01T00:00:00.000Z',
          catalogMeta: { name: 'my-plugin', description: 'A plugin', version: '1.0.0', location: 'https://example.com', hasSkills: true, hasMcpServers: false, hasCommands: false, hasAgents: false, hasHooks: false },
          skillCount: 0,
          agentCount: 0,
          mcpServerNames: [],
          commandCount: 0,
          agentIds: [],
          hookCount: 0,
        },
      ],
    });
    const plugin = sources.find(s => s.id === 'marketplace:my-plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.basePath).toBe('/cache/official/my-plugin/1.0.0/skills');
  });

  it('skips disabled marketplace plugins', () => {
    const sources = buildSkillSources({
      bundledPath: '/app/skills',
      installedPlugins: [
        {
          name: 'disabled-plugin',
          version: '1.0.0',
          enabled: false,
          cachePath: '/cache/official/disabled-plugin/1.0.0/skills',
          installedAt: '2026-01-01T00:00:00.000Z',
          catalogMeta: { name: 'disabled-plugin', description: 'A plugin', version: '1.0.0', location: 'https://example.com', hasSkills: true, hasMcpServers: false, hasCommands: false, hasAgents: false, hasHooks: false },
          skillCount: 0,
          agentCount: 0,
          mcpServerNames: [],
          commandCount: 0,
          agentIds: [],
          hookCount: 0,
        },
      ],
    });
    expect(sources.find(s => s.id === 'marketplace:disabled-plugin')).toBeUndefined();
  });
});
