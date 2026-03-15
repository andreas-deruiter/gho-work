import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { ISkillRegistry, SkillSource, SkillEntry } from '../common/skillRegistry.js';

export function parseFrontmatterDescription(content: string): string {
  if (!content.startsWith('---')) {
    return '';
  }
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return '';
  }
  const yaml = content.substring(3, endIndex);
  const match = yaml.match(/^description:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

export function parseFrontmatterName(content: string): string {
  if (!content.startsWith('---')) {
    return '';
  }
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return '';
  }
  const yaml = content.substring(3, endIndex);
  const match = yaml.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

export class SkillRegistryImpl extends Disposable implements ISkillRegistry {
  private _skills = new Map<string, SkillEntry>();
  private _scanPromise: Promise<void> | null = null;
  private _refreshPromise: Promise<void> | null = null;

  private readonly _onDidChangeSkills = this._register(new Emitter<SkillEntry[]>());
  readonly onDidChangeSkills: Event<SkillEntry[]> = this._onDidChangeSkills.event;

  constructor(private _sources: SkillSource[]) {
    super();
  }

  getSources(): SkillSource[] {
    return [...this._sources];
  }

  addSource(source: SkillSource): void {
    const duplicate = this._sources.some(s => s.id === source.id);
    if (duplicate) {
      return;
    }
    this._sources.push(source);
    this._sources.sort((a, b) => a.priority - b.priority);
  }

  removeSource(sourceId: string): void {
    const index = this._sources.findIndex(s => s.id === sourceId);
    if (index === -1) {
      return;
    }
    this._sources.splice(index, 1);
    for (const [key, entry] of this._skills) {
      if (entry.sourceId === sourceId) {
        this._skills.delete(key);
      }
    }
    this._onDidChangeSkills.fire(Array.from(this._skills.values()));
  }

  async scan(): Promise<void> {
    if (this._scanPromise) {
      return this._scanPromise;
    }
    this._scanPromise = this._doScan();
    try {
      await this._scanPromise;
    } finally {
      this._scanPromise = null;
    }
  }

  async refresh(): Promise<void> {
    if (this._refreshPromise) {
      return this._refreshPromise;
    }
    this._refreshPromise = (async () => {
      this._skills.clear();
      this._scanPromise = null;
      await this.scan();
    })();
    try {
      await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  async getSkill(category: string, name: string): Promise<string | undefined> {
    const entry = this._skills.get(`${category}/${name}`);
    if (!entry) {
      return undefined;
    }
    try {
      return await fs.readFile(entry.filePath, 'utf-8');
    } catch (err) {
      console.warn(`[skills] Could not read skill file ${entry.filePath}:`, err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }

  getEntry(category: string, name: string): SkillEntry | undefined {
    return this._skills.get(`${category}/${name}`);
  }

  list(category?: string): SkillEntry[] {
    const all = Array.from(this._skills.values());
    if (category) {
      return all.filter(e => e.category === category);
    }
    return all;
  }

  private async _doScan(): Promise<void> {
    const sorted = [...this._sources].sort((a, b) => a.priority - b.priority);

    for (const source of sorted) {
      await this._scanSource(source);
    }

    console.log(`[skills] Scanned ${sorted.length} source(s), found ${this._skills.size} skill(s)`);
    for (const source of sorted) {
      const count = Array.from(this._skills.values()).filter(e => e.sourceId === source.id).length;
      console.log(`  [${source.priority}] ${source.id}: ${source.basePath} (${count} skills)`);
    }

    this._onDidChangeSkills.fire(Array.from(this._skills.values()));
  }

  private async _scanSource(source: SkillSource): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(source.basePath, { withFileTypes: true });
    } catch (err) {
      console.warn(`[skills] Could not read source path ${source.basePath}:`, err instanceof Error ? err.message : String(err));
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) {
        continue;
      }

      const categoryPath = path.join(source.basePath, entry.name);
      const category = entry.name;

      let files: import('node:fs').Dirent[];
      try {
        files = await fs.readdir(categoryPath, { withFileTypes: true });
      } catch (err) {
        console.warn(`[skills] Could not read category ${categoryPath}:`, err instanceof Error ? err.message : String(err));
        continue;
      }

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.md')) {
          continue;
        }
        const name = file.name.slice(0, -3);
        const filePath = path.join(categoryPath, file.name);
        const isPlugin = source.id.startsWith('plugin:');
        const pluginName = isPlugin ? source.id.slice('plugin:'.length).split(':')[0] : '';
        const id = isPlugin ? `${pluginName}:${category}/${name}` : `${category}/${name}`;

        let description = '';
        let displayName = name;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          description = parseFrontmatterDescription(content);
          const fmName = parseFrontmatterName(content);
          if (fmName) {
            displayName = fmName;
          }
        } catch (err) {
          console.warn(`[skills] Could not read ${filePath}:`, err instanceof Error ? err.message : String(err));
        }

        // Only register files that have valid skill frontmatter (--- block with description:)
        if (!description) {
          continue;
        }

        this._skills.set(id, {
          id,
          category,
          name: displayName,
          description,
          sourceId: source.id,
          filePath,
        });
      }
    }
  }
}
