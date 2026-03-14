import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
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
      expect(all.length).toBeGreaterThanOrEqual(2);
      const ids = all.map(e => e.id);
      expect(ids).toContain('install/gh');
      expect(ids).toContain('auth/gh');
    });

    it('extracts description from frontmatter', () => {
      const entry = registry.getEntry('install', 'gh');
      expect(entry).toBeDefined();
      expect(entry!.description).toBe('Install GitHub CLI');
    });

    it('excludes files without frontmatter description', () => {
      const entry = registry.getEntry('install', 'no-frontmatter');
      expect(entry).toBeUndefined();
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
      expect(installSkills.length).toBeGreaterThanOrEqual(1);

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
      expect(fired[0].length).toBeGreaterThanOrEqual(2);
    });

    it('concurrent refresh calls do not race', async () => {
      await Promise.all([registry.refresh(), registry.refresh()]);
      expect(registry.list().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('addSource', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-test-'));
      // Create a category dir with a valid skill file
      const catDir = path.join(tmpDir, 'plugin-cat');
      await fs.mkdir(catDir, { recursive: true });
      await fs.writeFile(
        path.join(catDir, 'plugin-skill.md'),
        '---\ndescription: Plugin skill\n---\n# Plugin Skill\n\nContent here.'
      );
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('addSource adds a source and makes its skills discoverable after refresh()', async () => {
      registry.addSource({ id: 'plugin-source', priority: 10, basePath: tmpDir });
      await registry.refresh();

      const entry = registry.getEntry('plugin-cat', 'plugin-skill');
      expect(entry).toBeDefined();
      expect(entry!.sourceId).toBe('plugin-source');
      expect(entry!.description).toBe('Plugin skill');
    });

    it('getSources returns initial and dynamically added sources', () => {
      const before = registry.getSources();
      expect(before).toHaveLength(1);
      expect(before[0].id).toBe('test');

      registry.addSource({ id: 'plugin-source', priority: 10, basePath: tmpDir });
      const after = registry.getSources();
      expect(after).toHaveLength(2);
      expect(after.map(s => s.id)).toContain('plugin-source');

      // Returned array is a copy, not a reference
      after.push({ id: 'fake', priority: 99, basePath: '/fake' });
      expect(registry.getSources()).toHaveLength(2);
    });

    it('addSource with duplicate ID does not create duplicates', async () => {
      registry.addSource({ id: 'plugin-source', priority: 10, basePath: tmpDir });
      registry.addSource({ id: 'plugin-source', priority: 10, basePath: tmpDir });
      await registry.refresh();

      // Should only appear once — only one sourceId 'plugin-source'
      const all = registry.list();
      const fromSource = all.filter(e => e.sourceId === 'plugin-source');
      // One source, one skill file → exactly 1 entry
      expect(fromSource).toHaveLength(1);
    });
  });

  describe('removeSource', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-test-remove-'));
      const catDir = path.join(tmpDir, 'plugin-cat');
      await fs.mkdir(catDir, { recursive: true });
      await fs.writeFile(
        path.join(catDir, 'plugin-skill.md'),
        '---\ndescription: Plugin skill\n---\n# Plugin Skill\n\nContent here.'
      );
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('removeSource removes a source and its skills, fires onDidChangeSkills', async () => {
      const reg = new SkillRegistryImpl([
        { id: 'bundled', priority: 0, basePath: FIXTURES },
        { id: 'plugin-source', priority: 10, basePath: tmpDir },
      ]);
      await reg.scan();

      expect(reg.getEntry('plugin-cat', 'plugin-skill')).toBeDefined();

      const fired: SkillEntry[][] = [];
      reg.onDidChangeSkills(entries => fired.push(entries));

      reg.removeSource('plugin-source');

      expect(reg.getEntry('plugin-cat', 'plugin-skill')).toBeUndefined();
      expect(fired).toHaveLength(1);
      // Remaining skills should all be from bundled
      expect(fired[0].every(e => e.sourceId === 'bundled')).toBe(true);

      reg.dispose();
    });

    it('removeSource with non-existent ID does not throw', () => {
      expect(() => registry.removeSource('no-such-source')).not.toThrow();
    });
  });
});
