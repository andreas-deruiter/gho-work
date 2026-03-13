import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { SkillRegistryImpl } from '../node/skillRegistryImpl.js';
import type { SkillEntry } from '../common/skillRegistry.js';

const FIXTURES = path.join(__dirname, 'fixtures', 'skills');

describe('SkillRegistryImpl', () => {
  let registry: SkillRegistryImpl;

  beforeEach(async () => {
    registry = new SkillRegistryImpl([
      { id: 'test', priority: 0, basePath: FIXTURES },
    ]);
    await registry.scan();
  });

  afterEach(() => {
    registry.dispose();
  });

  describe('scan', () => {
    it('discovers skills from category directories', () => {
      const all = registry.list();
      expect(all.length).toBeGreaterThanOrEqual(3);
      const ids = all.map(e => e.id);
      expect(ids).toContain('install/gh');
      expect(ids).toContain('auth/gh');
      expect(ids).toContain('install/no-frontmatter');
    });

    it('extracts description from frontmatter', () => {
      const entry = registry.getEntry('install', 'gh');
      expect(entry).toBeDefined();
      expect(entry!.description).toBe('Install GitHub CLI');
    });

    it('handles missing frontmatter gracefully', () => {
      const entry = registry.getEntry('install', 'no-frontmatter');
      expect(entry).toBeDefined();
      expect(entry!.description).toBe('');
    });

    it('skips non-existent source paths silently', async () => {
      const reg = new SkillRegistryImpl([
        { id: 'ghost', priority: 0, basePath: '/tmp/does-not-exist-skill-test' },
      ]);
      await reg.scan();
      expect(reg.list()).toHaveLength(0);
      reg.dispose();
    });
  });

  describe('getSkill', () => {
    it('returns full file content for existing skill', async () => {
      const content = await registry.getSkill('install', 'gh');
      expect(content).toBeDefined();
      expect(content).toContain('# Install GitHub CLI');
      expect(content).toContain('Test fixture content');
    });

    it('returns undefined for non-existent skill', async () => {
      const content = await registry.getSkill('install', 'nonexistent');
      expect(content).toBeUndefined();
    });
  });

  describe('list', () => {
    it('filters by category', () => {
      const installSkills = registry.list('install');
      expect(installSkills.every(e => e.category === 'install')).toBe(true);
      expect(installSkills.length).toBeGreaterThanOrEqual(2);

      const authSkills = registry.list('auth');
      expect(authSkills.every(e => e.category === 'auth')).toBe(true);
      expect(authSkills.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('priority deduplication', () => {
    it('higher-priority source overrides lower-priority', async () => {
      const OVERRIDE = path.join(__dirname, 'fixtures', 'skills-override');
      const reg = new SkillRegistryImpl([
        { id: 'bundled', priority: 0, basePath: FIXTURES },
        { id: 'user', priority: 20, basePath: OVERRIDE },
      ]);
      await reg.scan();

      const entry = reg.getEntry('install', 'gh');
      expect(entry).toBeDefined();
      expect(entry!.sourceId).toBe('user');
      expect(entry!.description).toBe('Custom GitHub CLI installer');

      const content = await reg.getSkill('install', 'gh');
      expect(content).toContain('user override version');

      // auth/gh should still come from bundled (no override exists)
      const authEntry = reg.getEntry('auth', 'gh');
      expect(authEntry).toBeDefined();
      expect(authEntry!.sourceId).toBe('bundled');

      reg.dispose();
    });
  });

  describe('refresh', () => {
    it('re-scans and fires onDidChangeSkills', async () => {
      const fired: SkillEntry[][] = [];
      registry.onDidChangeSkills(entries => fired.push(entries));

      await registry.refresh();

      expect(fired.length).toBe(1);
      expect(fired[0].length).toBeGreaterThanOrEqual(3);
    });

    it('concurrent refresh calls do not race', async () => {
      await Promise.all([registry.refresh(), registry.refresh()]);
      expect(registry.list().length).toBeGreaterThanOrEqual(3);
    });
  });
});
