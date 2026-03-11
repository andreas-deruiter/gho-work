/**
 * Widget base class — all UI components extend this.
 */
import { Disposable } from '@gho-work/base';
import type { IDisposable } from '@gho-work/base';
import { addDisposableListener } from './dom.js';

export abstract class Widget extends Disposable {
  protected readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    super();
    this.element = element;
  }

  protected listen(
    target: EventTarget,
    type: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): IDisposable {
    return this._register(addDisposableListener(target, type, handler, options));
  }

  getDomNode(): HTMLElement {
    return this.element;
  }
}
