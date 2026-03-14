import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressSection } from './progressSection.js';
import type { PlanState } from './infoPanelState.js';

// Minimal DOM shim — Vitest with jsdom
describe('ProgressSection', () => {
  let section: ProgressSection;

  beforeEach(() => {
    section = new ProgressSection();
  });

  it('is hidden when no plan is set', () => {
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when a plan is set', () => {
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'completed' },
        { id: 's2', label: 'Analyze', state: 'active' },
        { id: 's3', label: 'Draft', state: 'pending' },
      ],
    });
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('renders correct number of step elements for short plan', () => {
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'pending' },
        { id: 's2', label: 'Analyze', state: 'pending' },
      ],
    });
    const steps = section.getDomNode().querySelectorAll('.info-step');
    expect(steps.length).toBe(2);
  });

  it('collapses completed steps when plan has >4 steps', () => {
    const steps = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, label: `Step ${i}`, state: (i < 5 ? 'completed' : i === 5 ? 'active' : 'pending') as PlanState['steps'][0]['state'],
    }));
    section.setPlan({ id: 'p1', steps });
    const summary = section.getDomNode().querySelector('.info-step-summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('5 steps completed');
  });

  it('shows progress bar for long plans', () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, label: `Step ${i}`, state: (i < 3 ? 'completed' : i === 3 ? 'active' : 'pending') as PlanState['steps'][0]['state'],
    }));
    section.setPlan({ id: 'p1', steps });
    const bar = section.getDomNode().querySelector('.info-progress-bar');
    expect(bar).not.toBeNull();
  });

  it('emits onDidClickStep with messageId when a step is clicked', () => {
    let clickedMsgId = '';
    section.onDidClickStep(msgId => { clickedMsgId = msgId; });
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'completed', messageId: 'msg-1' },
        { id: 's2', label: 'Analyze', state: 'active' },
      ],
    });
    const stepEl = section.getDomNode().querySelector('[data-step-id="s1"]') as HTMLElement;
    stepEl?.click();
    expect(clickedMsgId).toBe('msg-1');
  });

  it('does not emit onDidClickStep for steps without messageId', () => {
    let emitted = false;
    section.onDidClickStep(() => { emitted = true; });
    section.setPlan({
      id: 'p1',
      steps: [
        { id: 's1', label: 'Fetch', state: 'active' }, // no messageId
      ],
    });
    const stepEl = section.getDomNode().querySelector('[data-step-id="s1"]') as HTMLElement;
    stepEl?.click();
    expect(emitted).toBe(false);
  });

  it('disposes cleanly', () => {
    section.dispose();
    // No error on double dispose
    section.dispose();
  });
});
