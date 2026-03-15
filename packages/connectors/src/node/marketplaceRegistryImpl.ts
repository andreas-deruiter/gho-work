import { Emitter } from '@gho-work/base';
import type { Event, CatalogEntry } from '@gho-work/base';
import type { MarketplaceEntry, MarketplaceSource } from '../common/marketplaceTypes.js';

const OFFICIAL_MARKETPLACE: MarketplaceEntry = {
  name: 'gho-work',
  source: { type: 'github', repo: 'andreas-deruiter/gho-work' },
  owner: { name: 'GHO Work' },
  isDefault: true,
};

export class MarketplaceRegistryImpl {
  private _marketplaces: MarketplaceEntry[] = [OFFICIAL_MARKETPLACE];
  private _catalogs = new Map<string, CatalogEntry[]>();
  private readonly _onDidChange = new Emitter<MarketplaceEntry[]>();
  readonly onDidChange: Event<MarketplaceEntry[]> = this._onDidChange.event;

  constructor(
    private readonly _fetcherFactory: (source: MarketplaceSource) => { fetch(): Promise<CatalogEntry[]> },
    private readonly _settings: { get(key: string): unknown; set(key: string, value: unknown): void },
  ) {
    this._loadFromSettings();
  }

  list(): MarketplaceEntry[] { return [...this._marketplaces]; }

  async add(source: MarketplaceSource): Promise<MarketplaceEntry> {
    const name = this._nameFromSource(source);
    if (this._marketplaces.some(m => m.name === name)) {
      throw new Error(`Marketplace "${name}" already exists`);
    }
    const entry: MarketplaceEntry = { name, source, lastUpdated: new Date().toISOString() };
    this._marketplaces.push(entry);
    this._saveToSettings();
    this._onDidChange.fire(this.list());
    return entry;
  }

  async remove(name: string): Promise<void> {
    const idx = this._marketplaces.findIndex(m => m.name === name);
    if (idx === -1) throw new Error(`Marketplace "${name}" not found`);
    if (this._marketplaces[idx].isDefault) throw new Error('Cannot remove the official marketplace');
    this._marketplaces.splice(idx, 1);
    this._catalogs.delete(name);
    this._saveToSettings();
    this._onDidChange.fire(this.list());
  }

  async update(name: string): Promise<CatalogEntry[]> {
    const mp = this._marketplaces.find(m => m.name === name);
    if (!mp) throw new Error(`Marketplace "${name}" not found`);
    const fetcher = this._fetcherFactory(mp.source);
    const entries = await fetcher.fetch();
    this._catalogs.set(name, entries);
    mp.lastUpdated = new Date().toISOString();
    this._saveToSettings();
    return entries;
  }

  async fetchAll(): Promise<CatalogEntry[]> {
    const results: CatalogEntry[] = [];
    for (const mp of this._marketplaces) {
      try {
        const entries = await this.update(mp.name);
        results.push(...entries);
      } catch (err) {
        console.warn(`[MarketplaceRegistry] Failed to fetch ${mp.name}:`, err);
      }
    }
    return results;
  }

  getAllPlugins(): CatalogEntry[] {
    return [...this._catalogs.values()].flat();
  }

  private _nameFromSource(source: MarketplaceSource): string {
    if (source.type === 'github') return source.repo;
    if (source.type === 'url') return new URL(source.url).hostname;
    return source.path;
  }

  private _loadFromSettings(): void {
    const saved = this._settings.get('plugin.marketplaces') as MarketplaceEntry[] | undefined;
    if (saved) {
      for (const entry of saved) {
        if (!this._marketplaces.some(m => m.name === entry.name)) {
          this._marketplaces.push(entry);
        }
      }
    }
  }

  private _saveToSettings(): void {
    const toSave = this._marketplaces.filter(m => !m.isDefault);
    this._settings.set('plugin.marketplaces', toSave);
  }
}
