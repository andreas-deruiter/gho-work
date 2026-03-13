import * as fs from 'node:fs';
import * as path from 'node:path';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, MCPServerConfig } from '@gho-work/base';
import type { IConnectorConfigStore } from '../common/connectorConfigStore.js';

export class ConnectorConfigStoreImpl extends Disposable implements IConnectorConfigStore {
  private readonly _onDidChangeServers = this._register(
    new Emitter<Map<string, MCPServerConfig>>(),
  );
  readonly onDidChangeServers: Event<Map<string, MCPServerConfig>> =
    this._onDidChangeServers.event;

  private _servers = new Map<string, MCPServerConfig>();
  private readonly _filePath: string;
  private _watcher: fs.FSWatcher | null = null;
  private _suppressWatcher = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath: string) {
    super();
    this._filePath = filePath;

    // Ensure parent directory exists
    const dir = path.dirname(this._filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this._readFile();

    // If file didn't exist, create it with empty servers
    if (!fs.existsSync(this._filePath)) {
      this._writeFileSync();
    }

    this._startWatcher();
  }

  getServers(): Map<string, MCPServerConfig> {
    return new Map(this._servers);
  }

  getServer(name: string): MCPServerConfig | undefined {
    return this._servers.get(name);
  }

  async addServer(name: string, config: MCPServerConfig): Promise<void> {
    if (this._servers.has(name)) {
      throw new Error(`Server already exists: ${name}`);
    }
    this._servers.set(name, config);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  async updateServer(name: string, config: MCPServerConfig): Promise<void> {
    if (!this._servers.has(name)) {
      throw new Error(`Server not found: ${name}`);
    }
    this._servers.set(name, config);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  async removeServer(name: string): Promise<void> {
    if (!this._servers.has(name)) {
      throw new Error(`Server not found: ${name}`);
    }
    this._servers.delete(name);
    await this._writeFile();
    this._onDidChangeServers.fire(this.getServers());
  }

  getFilePath(): string {
    return this._filePath;
  }

  /** @internal — exposed for testing corruption handling */
  _readFile(): void {
    try {
      if (!fs.existsSync(this._filePath)) {
        return;
      }
      const raw = fs.readFileSync(this._filePath, 'utf-8');
      const parsed = JSON.parse(raw) as { servers?: Record<string, MCPServerConfig> };
      if (parsed.servers && typeof parsed.servers === 'object') {
        this._servers = new Map(Object.entries(parsed.servers));
      }
    } catch (err) {
      console.warn(
        `[ConnectorConfigStore] Failed to parse ${this._filePath}, keeping last-known-good config:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private _serializeToJson(): string {
    const obj: Record<string, MCPServerConfig> = {};
    for (const [name, config] of this._servers) {
      obj[name] = config;
    }
    return JSON.stringify({ servers: obj }, null, 2) + '\n';
  }

  private async _writeFile(): Promise<void> {
    const json = this._serializeToJson();
    const tmpPath = this._filePath + '.tmp';

    this._suppressWatcher = true;
    try {
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this._filePath);
    } finally {
      setTimeout(() => {
        this._suppressWatcher = false;
      }, 100);
    }
  }

  private _writeFileSync(): void {
    const json = this._serializeToJson();
    const tmpPath = this._filePath + '.tmp';

    this._suppressWatcher = true;
    try {
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this._filePath);
    } finally {
      setTimeout(() => {
        this._suppressWatcher = false;
      }, 100);
    }
  }

  private _startWatcher(): void {
    try {
      const dir = path.dirname(this._filePath);
      const basename = path.basename(this._filePath);
      this._watcher = fs.watch(dir, (eventType, filename) => {
        if (filename !== basename || this._suppressWatcher) {
          return;
        }
        if (this._debounceTimer) {
          clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
          this._readFile();
          this._onDidChangeServers.fire(this.getServers());
        }, 100);
      });
    } catch (err) {
      console.warn(
        '[ConnectorConfigStore] Could not start file watcher:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  override dispose(): void {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    super.dispose();
  }
}
