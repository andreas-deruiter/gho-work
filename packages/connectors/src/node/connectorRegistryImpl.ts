import Database from 'better-sqlite3';
import { Disposable, Emitter } from '@gho-work/base';
import type { ConnectorConfig, Event, ServerCapabilities } from '@gho-work/base';
import type { IConnectorRegistry } from '../common/connectorRegistry.js';

interface ConnectorRow {
  id: string;
  type: string;
  name: string;
  transport: string;
  command: string | null;
  args: string | null;
  env: string | null;
  url: string | null;
  headers: string | null;
  enabled: number;
  status: string;
  error: string | null;
  capabilities: string | null;
  tools_config: string | null;
  created_at: number;
  updated_at: number;
}

export class ConnectorRegistryImpl extends Disposable implements IConnectorRegistry {
  private readonly _onDidChangeConnectors = this._register(new Emitter<void>());
  readonly onDidChangeConnectors: Event<void> = this._onDidChangeConnectors.event;

  private readonly _onDidChangeStatus = this._register(
    new Emitter<{ id: string; status: ConnectorConfig['status'] }>(),
  );
  readonly onDidChangeStatus: Event<{ id: string; status: ConnectorConfig['status'] }> =
    this._onDidChangeStatus.event;

  constructor(private readonly _db: Database.Database) {
    super();
  }

  async addConnector(config: ConnectorConfig): Promise<void> {
    const now = Date.now();
    const stmt = this._db.prepare(`
      INSERT INTO connectors (
        id, type, name, transport, command, args, env, url, headers,
        enabled, status, error, capabilities, tools_config,
        created_at, updated_at
      ) VALUES (
        @id, @type, @name, @transport, @command, @args, @env, @url, @headers,
        @enabled, @status, @error, @capabilities, @tools_config,
        @created_at, @updated_at
      )
    `);
    stmt.run({
      id: config.id,
      type: config.type,
      name: config.name,
      transport: config.transport,
      command: config.command ?? null,
      args: config.args !== undefined ? JSON.stringify(config.args) : null,
      env: config.env !== undefined ? JSON.stringify(config.env) : null,
      url: config.url ?? null,
      headers: config.headers !== undefined ? JSON.stringify(config.headers) : null,
      enabled: config.enabled ? 1 : 0,
      status: config.status,
      error: config.error ?? null,
      capabilities: config.capabilities !== undefined ? JSON.stringify(config.capabilities) : null,
      tools_config: config.toolsConfig !== undefined ? JSON.stringify(config.toolsConfig) : null,
      created_at: now,
      updated_at: now,
    });
    this._onDidChangeConnectors.fire();
  }

  async updateConnector(id: string, updates: Partial<ConnectorConfig>): Promise<void> {
    const existing = await this.getConnector(id);
    if (existing === undefined) {
      return;
    }
    const merged = { ...existing, ...updates };
    const now = Date.now();
    const stmt = this._db.prepare(`
      UPDATE connectors SET
        type = @type,
        name = @name,
        transport = @transport,
        command = @command,
        args = @args,
        env = @env,
        url = @url,
        headers = @headers,
        enabled = @enabled,
        status = @status,
        error = @error,
        capabilities = @capabilities,
        tools_config = @tools_config,
        updated_at = @updated_at
      WHERE id = @id
    `);
    stmt.run({
      id,
      type: merged.type,
      name: merged.name,
      transport: merged.transport,
      command: merged.command ?? null,
      args: merged.args !== undefined ? JSON.stringify(merged.args) : null,
      env: merged.env !== undefined ? JSON.stringify(merged.env) : null,
      url: merged.url ?? null,
      headers: merged.headers !== undefined ? JSON.stringify(merged.headers) : null,
      enabled: merged.enabled ? 1 : 0,
      status: merged.status,
      error: merged.error ?? null,
      capabilities: merged.capabilities !== undefined ? JSON.stringify(merged.capabilities) : null,
      tools_config: merged.toolsConfig !== undefined ? JSON.stringify(merged.toolsConfig) : null,
      updated_at: now,
    });
    this._onDidChangeConnectors.fire();
  }

  async removeConnector(id: string): Promise<void> {
    this._db.prepare('DELETE FROM connectors WHERE id = ?').run(id);
    this._onDidChangeConnectors.fire();
  }

  async getConnector(id: string): Promise<ConnectorConfig | undefined> {
    const row = this._db
      .prepare('SELECT * FROM connectors WHERE id = ?')
      .get(id) as ConnectorRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    return this._rowToConfig(row);
  }

  async getConnectors(): Promise<ConnectorConfig[]> {
    const rows = this._db
      .prepare('SELECT * FROM connectors ORDER BY created_at ASC')
      .all() as ConnectorRow[];
    return rows.map(row => this._rowToConfig(row));
  }

  async getEnabledConnectors(): Promise<ConnectorConfig[]> {
    const rows = this._db
      .prepare('SELECT * FROM connectors WHERE enabled = 1 ORDER BY created_at ASC')
      .all() as ConnectorRow[];
    return rows.map(row => this._rowToConfig(row));
  }

  async updateStatus(
    id: string,
    status: ConnectorConfig['status'],
    error?: string,
  ): Promise<void> {
    this._db
      .prepare('UPDATE connectors SET status = @status, error = @error, updated_at = @updated_at WHERE id = @id')
      .run({ id, status, error: error ?? null, updated_at: Date.now() });
    this._onDidChangeStatus.fire({ id, status });
  }

  private _rowToConfig(row: ConnectorRow): ConnectorConfig {
    return {
      id: row.id,
      type: row.type as ConnectorConfig['type'],
      name: row.name,
      transport: row.transport as ConnectorConfig['transport'],
      command: row.command ?? undefined,
      args: row.args !== null ? (JSON.parse(row.args) as string[]) : undefined,
      env: row.env !== null ? (JSON.parse(row.env) as Record<string, string>) : undefined,
      url: row.url ?? undefined,
      headers:
        row.headers !== null
          ? (JSON.parse(row.headers) as Record<string, string>)
          : undefined,
      enabled: row.enabled === 1,
      status: row.status as ConnectorConfig['status'],
      error: row.error ?? undefined,
      capabilities:
        row.capabilities !== null
          ? (JSON.parse(row.capabilities) as ServerCapabilities)
          : undefined,
      toolsConfig:
        row.tools_config !== null
          ? (JSON.parse(row.tools_config) as Record<string, boolean>)
          : undefined,
    };
  }
}
