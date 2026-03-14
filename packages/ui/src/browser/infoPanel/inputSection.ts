/**
 * InputSection widget — shows files and tools referenced in a conversation.
 *
 * - Collapsible section header ("Input")
 * - Chronological list of InputEntry items (file or tool)
 * - Each entry: icon, name, optional count badge
 * - Click emits onDidClickEntry(messageId)
 * - Hidden when empty, shows on first entry
 * - ARIA: role="region", entries are focusable buttons with aria-label
 */
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import type { InputEntry } from './infoPanelState.js';

/** File icon SVG (simple document shape). */
const FILE_ICON = '📄';
/** Tool icon (gear). */
const TOOL_ICON = '⚙';

export class InputSection extends Widget {
  private readonly _onDidClickEntry = this._register(new Emitter<string>());
  readonly onDidClickEntry: Event<string> = this._onDidClickEntry.event;

  private readonly _bodyEl: HTMLElement;

  /** Map from path → { entryEl, countEl, messageId } for updates. */
  private readonly _entryMap = new Map<string, { entryEl: HTMLElement; countEl: HTMLElement; messageId: string }>();

  constructor() {
    const layout = h('section.info-input-section@root', [
      h('h3.info-section-header@header'),
      h('div.info-section-body@body'),
    ]);

    super(layout.root);

    const headerEl = layout['header'] as HTMLElement;
    headerEl.textContent = 'Input';

    this._bodyEl = layout['body'] as HTMLElement;

    // ARIA
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Input files and tools');
    this._bodyEl.setAttribute('role', 'list');

    // Hidden until there is at least one entry
    this.element.style.display = 'none';
  }

  /**
   * Add a new entry to the input section. Shows the section if it was hidden.
   */
  addEntry(entry: InputEntry): void {
    // Show section
    this.element.style.display = '';

    const entryEl = document.createElement('button');
    entryEl.className = `info-entry info-entry--${entry.kind}`;
    entryEl.setAttribute('role', 'listitem');
    entryEl.setAttribute('aria-label', entry.name);
    entryEl.setAttribute('tabindex', '0');
    entryEl.type = 'button';

    // Icon
    const iconEl = document.createElement('span');
    iconEl.className = 'info-entry-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = entry.kind === 'tool' ? TOOL_ICON : FILE_ICON;

    // Name
    const nameEl = document.createElement('span');
    nameEl.className = 'info-entry-name';
    nameEl.textContent = entry.name;

    // Count badge
    const countEl = document.createElement('span');
    countEl.className = 'info-entry-count';
    countEl.textContent = String(entry.count);
    countEl.style.display = entry.count > 1 ? '' : 'none';

    entryEl.appendChild(iconEl);
    entryEl.appendChild(nameEl);
    entryEl.appendChild(countEl);

    this._bodyEl.appendChild(entryEl);

    const messageId = entry.messageId;
    this._register(addDisposableListener(entryEl, 'click', () => {
      this._onDidClickEntry.fire(messageId);
    }));
    this._register(addDisposableListener(entryEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        this._onDidClickEntry.fire(messageId);
      }
    }));

    this._entryMap.set(entry.path, { entryEl, countEl, messageId });
  }

  /**
   * Update the count badge for an existing entry.
   */
  updateCount(path: string, count: number): void {
    const record = this._entryMap.get(path);
    if (!record) {
      return;
    }
    record.countEl.textContent = String(count);
    record.countEl.style.display = count > 1 ? '' : 'none';
  }
}
