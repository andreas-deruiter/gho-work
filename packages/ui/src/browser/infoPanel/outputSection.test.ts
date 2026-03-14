import { describe, it, expect, beforeEach } from 'vitest';
import { OutputSection } from './outputSection.js';

describe('OutputSection', () => {
  let section: OutputSection;

  beforeEach(() => {
    section = new OutputSection();
  });

  it('is hidden when no outputs', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows after adding an output', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders entry with filename, size, and new badge', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const entry = section.getDomNode().querySelector('.info-entry');
    expect(entry!.querySelector('.info-entry-name')!.textContent).toBe('report.pdf');
    expect(entry!.querySelector('.info-entry-size')!.textContent).toBe('152 KB');
    expect(entry!.querySelector('.info-entry-badge')!.textContent).toBe('new');
  });

  it('shows edited badge for modified files', () => {
    section.addEntry({ name: 'config.json', path: '/tmp/config.json', size: 1024, action: 'modified', messageId: 'msg-2' });
    const badge = section.getDomNode().querySelector('.info-entry-badge');
    expect(badge!.textContent).toBe('edited');
    expect(badge!.classList.contains('info-entry-badge--edited')).toBe(true);
  });

  it('updates existing entry when same path is written again', () => {
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 100000, action: 'created', messageId: 'msg-1' });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 200000, action: 'modified', messageId: 'msg-3' });
    const entries = section.getDomNode().querySelectorAll('.info-entry');
    expect(entries.length).toBe(1);
    expect(entries[0].querySelector('.info-entry-size')!.textContent).toBe('195 KB');
    expect(entries[0].querySelector('.info-entry-badge')!.textContent).toBe('edited');
  });

  it('emits onDidClickEntry with messageId', () => {
    let clickedMsgId = '';
    section.onDidClickEntry(msgId => { clickedMsgId = msgId; });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const nameEl = section.getDomNode().querySelector('.info-entry-name') as HTMLElement;
    nameEl?.click();
    expect(clickedMsgId).toBe('msg-1');
  });

  it('emits onDidRequestReveal with path', () => {
    let revealedPath = '';
    section.onDidRequestReveal(p => { revealedPath = p; });
    section.addEntry({ name: 'report.pdf', path: '/tmp/report.pdf', size: 156000, action: 'created', messageId: 'msg-1' });
    const revealBtn = section.getDomNode().querySelector('.info-entry-reveal') as HTMLElement;
    revealBtn?.click();
    expect(revealedPath).toBe('/tmp/report.pdf');
  });
});
