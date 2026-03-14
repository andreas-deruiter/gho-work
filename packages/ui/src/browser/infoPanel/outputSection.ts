/**
 * OutputSection widget — shows files produced or modified during a conversation.
 *
 * - Collapsible section header ("Output")
 * - Chronological list of OutputEntry items
 * - Each entry: file icon, filename (with tooltip), size (formatted), badge ("new"/"edited"), reveal icon
 * - Click filename emits onDidClickEntry(messageId)
 * - Click reveal icon emits onDidRequestReveal(path)
 * - addEntry deduplicates by path; updates size/badge on re-write
 * - Hidden when empty
 * - ARIA: role="region", entries use role="listitem"
 */
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import type { OutputEntry } from './infoPanelState.js';
import { formatFileSize } from './infoPanelState.js';

/** File icon (document). */
const FILE_ICON = '📄';
/** Reveal icon (folder open). */
const REVEAL_ICON = '📂';

interface EntryRecord {
  entryEl: HTMLElement;
  sizeEl: HTMLElement;
  badgeEl: HTMLElement;
  messageId: string;
}

export class OutputSection extends Widget {
  private readonly _onDidClickEntry = this._register(new Emitter<string>());
  readonly onDidClickEntry: Event<string> = this._onDidClickEntry.event;

  private readonly _onDidRequestReveal = this._register(new Emitter<string>());
  readonly onDidRequestReveal: Event<string> = this._onDidRequestReveal.event;

  private readonly _bodyEl: HTMLElement;

  /** Map from path → entry record for deduplication and updates. */
  private readonly _entryMap = new Map<string, EntryRecord>();

  constructor() {
    const layout = h('section.info-output-section@root', [
      h('h3.info-section-header@header'),
      h('div.info-section-body@body'),
    ]);

    super(layout.root);

    const headerEl = layout['header'] as HTMLElement;
    headerEl.textContent = 'Output';

    this._bodyEl = layout['body'] as HTMLElement;

    // ARIA
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Output files');
    this._bodyEl.setAttribute('role', 'list');

    // Hidden until there is at least one entry
    this.element.style.display = 'none';
  }

  /**
   * Add a new output entry, or update an existing one if the path already exists.
   * Shows the section if it was hidden.
   */
  addEntry(entry: OutputEntry): void {
    // Show section
    this.element.style.display = '';

    // Deduplicate by path — update existing entry if found
    const existing = this._entryMap.get(entry.path);
    if (existing) {
      existing.sizeEl.textContent = formatFileSize(entry.size);
      existing.badgeEl.textContent = entry.action === 'modified' ? 'edited' : 'new';
      if (entry.action === 'modified') {
        existing.badgeEl.classList.add('info-entry-badge--edited');
      } else {
        existing.badgeEl.classList.remove('info-entry-badge--edited');
      }
      return;
    }

    // Build entry element
    const entryEl = document.createElement('div');
    entryEl.className = 'info-entry';
    entryEl.setAttribute('role', 'listitem');

    // File icon
    const iconEl = document.createElement('span');
    iconEl.className = 'info-entry-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = FILE_ICON;

    // Filename — click emits onDidClickEntry
    const nameEl = document.createElement('span');
    nameEl.className = 'info-entry-name';
    nameEl.textContent = entry.name;
    nameEl.title = entry.path;
    nameEl.setAttribute('tabindex', '0');
    nameEl.setAttribute('role', 'button');
    nameEl.setAttribute('aria-label', `Go to message for ${entry.name}`);

    // Size
    const sizeEl = document.createElement('span');
    sizeEl.className = 'info-entry-size';
    sizeEl.textContent = formatFileSize(entry.size);

    // Badge ("new" / "edited")
    const badgeEl = document.createElement('span');
    badgeEl.className = 'info-entry-badge';
    if (entry.action === 'modified') {
      badgeEl.textContent = 'edited';
      badgeEl.classList.add('info-entry-badge--edited');
    } else {
      badgeEl.textContent = 'new';
    }

    // Reveal icon button — click emits onDidRequestReveal
    const revealEl = document.createElement('span');
    revealEl.className = 'info-entry-reveal';
    revealEl.setAttribute('aria-hidden', 'true');
    revealEl.setAttribute('tabindex', '0');
    revealEl.setAttribute('role', 'button');
    revealEl.setAttribute('aria-label', `Reveal ${entry.name} in folder`);
    revealEl.textContent = REVEAL_ICON;

    entryEl.appendChild(iconEl);
    entryEl.appendChild(nameEl);
    entryEl.appendChild(sizeEl);
    entryEl.appendChild(badgeEl);
    entryEl.appendChild(revealEl);

    this._bodyEl.appendChild(entryEl);

    // Wire click events
    const messageId = entry.messageId;
    const path = entry.path;

    this._register(addDisposableListener(nameEl, 'click', () => {
      this._onDidClickEntry.fire(messageId);
    }));
    this._register(addDisposableListener(nameEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        this._onDidClickEntry.fire(messageId);
      }
    }));

    this._register(addDisposableListener(revealEl, 'click', (e) => {
      e.stopPropagation();
      this._onDidRequestReveal.fire(path);
    }));
    this._register(addDisposableListener(revealEl, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        this._onDidRequestReveal.fire(path);
      }
    }));

    this._entryMap.set(path, { entryEl, sizeEl, badgeEl, messageId });
  }
}
