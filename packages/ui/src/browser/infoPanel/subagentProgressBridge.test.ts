import { describe, it, expect } from 'vitest';
import { correlateSubagentToStep, processSubagentEvent } from './subagentProgressBridge.js';
import { InfoPanelState } from './infoPanelState.js';
import type { PlanStep } from './infoPanelState.js';
import type { AgentEvent } from '@gho-work/base';

function makeSteps(...states: Array<PlanStep['state']>): PlanStep[] {
  return states.map((state, i) => ({
    id: `step-${i}`,
    label: `Step ${i}`,
    state,
  }));
}

describe('correlateSubagentToStep', () => {
  it('returns first pending step', () => {
    const steps = makeSteps('completed', 'pending', 'pending');
    const result = correlateSubagentToStep(steps);
    expect(result?.id).toBe('step-1');
  });

  it('returns undefined when no pending steps', () => {
    const steps = makeSteps('completed', 'completed');
    expect(correlateSubagentToStep(steps)).toBeUndefined();
  });

  it('returns undefined for empty steps', () => {
    expect(correlateSubagentToStep([])).toBeUndefined();
  });
});

describe('processSubagentEvent', () => {
  it('maps subagent_started to active step with agentName', () => {
    const state = new InfoPanelState();
    state.setPlan({ id: 'p1', steps: [{ id: 's1', label: 'Do thing' }] });

    const event: AgentEvent = {
      type: 'subagent_started',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
    };

    const result = processSubagentEvent(event, state);
    expect(result?.step).toEqual({
      id: 's1',
      state: 'active',
      agentName: 'Doc Drafter',
    });
  });

  it('maps subagent_completed to completed step', () => {
    const state = new InfoPanelState();
    state.setPlan({ id: 'p1', steps: [{ id: 's1', label: 'Do thing' }] });
    // Simulate the step being active
    state.updateStep('s1', 'active');

    const event: AgentEvent = {
      type: 'subagent_completed',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
    };

    const result = processSubagentEvent(event, state);
    expect(result?.step).toEqual({ id: 's1', state: 'completed' });
  });

  it('maps subagent_failed to failed step with error', () => {
    const state = new InfoPanelState();
    state.setPlan({ id: 'p1', steps: [{ id: 's1', label: 'Do thing' }] });
    state.updateStep('s1', 'active');

    const event: AgentEvent = {
      type: 'subagent_failed',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      error: 'Timeout',
    };

    const result = processSubagentEvent(event, state);
    expect(result?.step).toEqual({
      id: 's1',
      state: 'failed',
      error: 'Timeout',
    });
  });

  it('returns standalone for subagent without plan', () => {
    const state = new InfoPanelState();

    const event: AgentEvent = {
      type: 'subagent_started',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
    };

    const result = processSubagentEvent(event, state);
    expect(result?.standalone).toEqual({
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
      state: 'active',
    });
  });

  it('returns null for non-subagent events', () => {
    const state = new InfoPanelState();
    const event: AgentEvent = { type: 'text', content: 'hello' };
    expect(processSubagentEvent(event, state)).toBeNull();
  });
});
