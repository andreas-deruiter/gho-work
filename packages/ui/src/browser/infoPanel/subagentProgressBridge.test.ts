import { describe, it, expect } from 'vitest';
import { processSubagentEvent } from './subagentProgressBridge.js';
import { InfoPanelState } from './infoPanelState.js';
import type { AgentEvent } from '@gho-work/base';

describe('processSubagentEvent', () => {
  it('maps subagent_started to standalone active', () => {
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

  it('maps subagent_completed to standalone completed', () => {
    const state = new InfoPanelState();
    const event: AgentEvent = {
      type: 'subagent_completed',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
    };
    const result = processSubagentEvent(event, state);
    expect(result?.standalone).toEqual({
      name: 'doc-drafter',
      displayName: 'Doc Drafter',
      state: 'completed',
    });
  });

  it('maps subagent_failed to standalone failed with error', () => {
    const state = new InfoPanelState();
    const event: AgentEvent = {
      type: 'subagent_failed',
      parentToolCallId: 'tc1',
      name: 'doc-drafter',
      error: 'Timeout',
    };
    const result = processSubagentEvent(event, state);
    expect(result?.standalone).toEqual({
      name: 'doc-drafter',
      displayName: 'doc-drafter',
      state: 'failed',
      error: 'Timeout',
    });
  });

  it('returns null for non-subagent events', () => {
    const state = new InfoPanelState();
    const event: AgentEvent = { type: 'text', content: 'hello' };
    expect(processSubagentEvent(event, state)).toBeNull();
  });
});
