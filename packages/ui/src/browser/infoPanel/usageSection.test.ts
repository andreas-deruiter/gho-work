import { describe, it, expect } from 'vitest';
import { UsageSection } from './usageSection.js';

describe('UsageSection', () => {
  it('starts hidden', () => {
    const section = new UsageSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when quota data arrives', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('shows used percentage badge', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    // Badge shows used percentage: 100 - remainingPercentage
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('64%');
  });

  it('renders request counts', () => {
    const section = new UsageSection();
    section.update({ used: 642, total: 1000, remainingPercentage: 36, resetDate: '2026-03-21' });
    const text = section.getDomNode().querySelector('.info-usage-requests')?.textContent;
    expect(text).toContain('642');
    expect(text).toContain('1,000');
  });

  it('renders reset date', () => {
    const section = new UsageSection();
    section.update({ used: 100, total: 1000, remainingPercentage: 90, resetDate: '2026-03-21' });
    const text = section.getDomNode().querySelector('.info-usage-reset')?.textContent;
    expect(text).toContain('Mar 21');
  });

  it('sets progress bar width', () => {
    const section = new UsageSection();
    section.update({ used: 500, total: 1000, remainingPercentage: 50, resetDate: '2026-03-21' });
    const bar = section.getDomNode().querySelector('.info-usage-bar-fill') as HTMLElement;
    expect(bar?.style.width).toBe('50%');
  });
});
