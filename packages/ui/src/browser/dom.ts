/**
 * Declarative DOM creation helper, adapted from VS Code's dom.ts.
 */
import type { IDisposable } from '@gho-work/base';

type HResult = { root: HTMLElement; [key: string]: HTMLElement };

export function h(selector: string, children?: HResult[]): HResult {
  const { tag, classes, id, name } = parseSelector(selector);
  const el = document.createElement(tag);

  if (classes.length > 0) {
    el.classList.add(...classes);
  }
  if (id) {
    el.id = id;
  }

  const result: HResult = { root: el };
  if (name) {
    result[name] = el;
  }

  if (children) {
    for (const child of children) {
      el.appendChild(child.root);
      for (const [key, value] of Object.entries(child)) {
        if (key !== 'root') {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

function parseSelector(selector: string): {
  tag: string;
  classes: string[];
  id: string;
  name: string;
} {
  let tag = 'div';
  const classes: string[] = [];
  let id = '';
  let name = '';

  const atIdx = selector.indexOf('@');
  if (atIdx !== -1) {
    name = selector.slice(atIdx + 1);
    selector = selector.slice(0, atIdx);
  }

  const hashIdx = selector.indexOf('#');
  if (hashIdx !== -1) {
    const rest = selector.slice(hashIdx + 1);
    const dotIdx = rest.indexOf('.');
    if (dotIdx !== -1) {
      id = rest.slice(0, dotIdx);
      classes.push(...rest.slice(dotIdx + 1).split('.').filter(Boolean));
    } else {
      id = rest;
    }
    selector = selector.slice(0, hashIdx);
  }

  const parts = selector.split('.').filter(Boolean);
  if (parts.length > 0) {
    if (!selector.startsWith('.')) {
      tag = parts.shift()!;
    }
    classes.push(...parts);
  }

  return { tag, classes, id, name };
}

export function addDisposableListener(
  element: EventTarget,
  type: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): IDisposable {
  element.addEventListener(type, handler, options);
  return {
    dispose: () => {
      element.removeEventListener(type, handler, options);
    },
  };
}
