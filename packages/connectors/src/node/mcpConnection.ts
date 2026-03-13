import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types';
import { Disposable, Emitter, toDisposable } from '@gho-work/base';
import type { MCPServerConfig, MCPServerStatus, Event } from '@gho-work/base';
import type { ToolInfo } from '../common/mcpClientManager.js';

export class MCPConnection extends Disposable {
  private _client: Client | null = null;
  private _tools: ToolInfo[] = [];
  private _status: MCPServerStatus = 'disconnected';
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _missedPings = 0;

  private readonly _onDidChangeStatus = this._register(new Emitter<MCPServerStatus>());
  readonly onDidChangeStatus: Event<MCPServerStatus> = this._onDidChangeStatus.event;

  private readonly _onDidChangeTools = this._register(new Emitter<ToolInfo[]>());
  readonly onDidChangeTools: Event<ToolInfo[]> = this._onDidChangeTools.event;

  constructor(private readonly _name: string, private readonly _config: MCPServerConfig) {
    super();
  }

  get status(): MCPServerStatus {
    return this._status;
  }

  async connect(): Promise<void> {
    this._setStatus('initializing');

    const transport = this._createTransport();
    this._client = new Client({ name: 'gho-work', version: '1.0.0' });

    try {
      await this._client.connect(transport);
      await this._refreshTools();
      this._setStatus('connected');
      this._startHeartbeat();

      // Listen for tool list changes using the SDK's exported Zod schema.
      this._client.setNotificationHandler(
        ToolListChangedNotificationSchema,
        async () => {
          await this._refreshTools();
        },
      );
    } catch (err) {
      this._setStatus('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this._stopHeartbeat();
    if (this._client) {
      try {
        await this._client.close();
      } catch {
        // ignore close errors
      }
      this._client = null;
    }
    this._setStatus('disconnected');
  }

  listTools(): ToolInfo[] {
    return this._tools;
  }

  private _createTransport(): StdioClientTransport | StreamableHTTPClientTransport {
    if (this._config.type === 'stdio') {
      return new StdioClientTransport({
        command: this._config.command!,
        args: this._config.args,
        env: this._config.env,
        cwd: this._config.cwd,
      });
    } else {
      return new StreamableHTTPClientTransport(
        new URL(this._config.url!),
        this._config.headers ? { requestInit: { headers: this._config.headers } } : undefined,
      );
    }
  }

  private async _refreshTools(): Promise<void> {
    if (!this._client) {
      return;
    }
    const result = await this._client.listTools();
    this._tools = result.tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      enabled: true,
    }));
    this._onDidChangeTools.fire(this._tools);
  }

  private _startHeartbeat(): void {
    this._missedPings = 0;
    this._heartbeatInterval = setInterval(async () => {
      try {
        await this._client?.ping();
        if (this._missedPings > 0) {
          this._missedPings = 0;
          this._setStatus('connected');
        }
      } catch {
        this._missedPings++;
        if (this._missedPings >= 3) {
          this._setStatus('error');
        }
      }
    }, 30_000);
    this._register(toDisposable(() => this._stopHeartbeat()));
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }

  private _setStatus(status: MCPServerStatus): void {
    if (this._status !== status) {
      this._status = status;
      this._onDidChangeStatus.fire(status);
    }
  }

  override dispose(): void {
    this.disconnect().catch(() => {});
    super.dispose();
  }
}
