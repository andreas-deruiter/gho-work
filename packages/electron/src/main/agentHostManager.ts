/**
 * Manages the Agent Host utility process lifecycle.
 * Spawns the process, creates MessagePort channels, handles crash recovery.
 */
import { utilityProcess, MessageChannelMain } from 'electron';
import type { BrowserWindow, UtilityProcess } from 'electron';
import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';

export class AgentHostManager extends Disposable {
  private _process: UtilityProcess | null = null;
  private _restartCount = 0;
  private _lastRestartTime = 0;

  private readonly _onDidStart = this._register(new Emitter<void>());
  readonly onDidStart: Event<void> = this._onDidStart.event;

  private readonly _onDidCrash = this._register(new Emitter<number>());
  readonly onDidCrash: Event<number> = this._onDidCrash.event;

  constructor(
    private readonly _workerPath: string,
    private readonly _mainWindow: BrowserWindow,
  ) {
    super();
  }

  start(): void {
    if (this._process) {
      return;
    }

    this._process = utilityProcess.fork(this._workerPath, [], {
      serviceName: 'gho-agent-host',
    });

    const { port1: agentPort, port2: rendererPort } = new MessageChannelMain();

    this._process.postMessage({ type: 'port' }, [agentPort]);
    this._mainWindow.webContents.postMessage('port:agent-host', null, [rendererPort]);

    this._process.on('exit', (code) => {
      this._process = null;
      if (code !== 0) {
        this._onDidCrash.fire(code);
        this._maybeRestart();
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._process.on('message', (msg: any) => {
      if (msg?.type === 'ready') {
        this._onDidStart.fire();
      }
    });
  }

  private _maybeRestart(): void {
    const now = Date.now();
    if (now - this._lastRestartTime > 5 * 60 * 1000) {
      this._restartCount = 0;
    }

    if (this._restartCount < 3) {
      this._restartCount++;
      this._lastRestartTime = now;
      const delay = this._restartCount * 1000;
      setTimeout(() => this.start(), delay);
    }
  }

  override dispose(): void {
    this._process?.kill();
    this._process = null;
    super.dispose();
  }
}
