import { describe, it, expect, beforeEach } from 'vitest';
import { InputSection } from './inputSection.js';

describe('InputSection', () => {
  let section: InputSection;

  beforeEach(() => {
    section = new InputSection();
  });

  it('is hidden when no inputs', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows after adding an input', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders file entries with file icon', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry).not.toBeNull();
    expect(entry!.querySelector('.info-entry-name')!.textContent).toBe('data.csv');
  });

  it('renders tool entries with tool icon', () => {
    section.addEntry({ name: 'google-sheets / getCellRange', path: 'google-sheets/getCellRange', messageId: 'msg-2', kind: 'tool', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry!.classList.contains('info-entry--tool')).toBe(true);
  });

  it('updates count badge on duplicate', () => {
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    section.updateCount('/tmp/data.csv', 3);
    const badge = section.getDomNode().querySelector('.info-entry-count');
    expect(badge!.textContent).toBe('3');
  });

  it('emits onDidClickEntry when entry clicked', () => {
    let clickedMsgId = '';
    section.onDidClickEntry(msgId => { clickedMsgId = msgId; });
    section.addEntry({ name: 'data.csv', path: '/tmp/data.csv', messageId: 'msg-1', kind: 'file', count: 1 });
    const entry = section.getDomNode().querySelector('.info-entry') as HTMLElement;
    entry?.click();
    expect(clickedMsgId).toBe('msg-1');
  });
});
