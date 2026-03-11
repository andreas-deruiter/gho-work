import { Disposable } from '@gho-work/base';
import { addDisposableListener } from './dom.js';

interface ShortcutBinding {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
}

export class KeyboardShortcuts extends Disposable {
  private readonly _bindings: ShortcutBinding[] = [];

  constructor() {
    super();
    this._register(
      addDisposableListener(document, 'keydown', (e) => this._handleKeyDown(e as KeyboardEvent)),
    );
  }

  bind(binding: ShortcutBinding): void {
    this._bindings.push(binding);
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    for (const binding of this._bindings) {
      const metaMatch = binding.meta ? (e.metaKey || e.ctrlKey) : !(e.metaKey || e.ctrlKey);
      const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
      if (e.key.toLowerCase() === binding.key.toLowerCase() && metaMatch && shiftMatch) {
        e.preventDefault();
        binding.handler();
        return;
      }
    }
  }
}
