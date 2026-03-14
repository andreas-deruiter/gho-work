import { Disposable, Emitter, createServiceIdentifier } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';

export type ThemeKind = 'light' | 'dark' | 'system';

export interface IThemeService {
  readonly currentTheme: ThemeKind;
  readonly onDidChangeTheme: Event<ThemeKind>;
  setTheme(theme: ThemeKind): void;
  init(): Promise<void>;
}

export const IThemeService = createServiceIdentifier<IThemeService>('IThemeService');

export class ThemeService extends Disposable implements IThemeService {
  private _currentTheme: ThemeKind = 'system';
  private readonly _onDidChangeTheme = this._register(new Emitter<ThemeKind>());
  readonly onDidChangeTheme: Event<ThemeKind> = this._onDidChangeTheme.event;

  constructor(private readonly _ipc: IIPCRenderer) {
    super();
  }

  get currentTheme(): ThemeKind {
    return this._currentTheme;
  }

  async init(): Promise<void> {
    try {
      const result = await this._ipc.invoke<{ value: string | null }>(
        IPC_CHANNELS.STORAGE_GET,
        { key: 'theme' },
      );
      if (result.value === 'light' || result.value === 'dark' || result.value === 'system') {
        this._currentTheme = result.value;
      }
    } catch (err) {
      console.warn('[ThemeService] Failed to load persisted theme:', err);
    }
    this._applyTheme(this._currentTheme);
  }

  setTheme(theme: ThemeKind): void {
    this._currentTheme = theme;
    this._applyTheme(theme);
    this._onDidChangeTheme.fire(theme);
    void this._ipc.invoke(IPC_CHANNELS.STORAGE_SET, { key: 'theme', value: theme }).catch((err) => {
      console.warn('[ThemeService] Failed to persist theme:', err);
    });
  }

  private _applyTheme(theme: ThemeKind): void {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
