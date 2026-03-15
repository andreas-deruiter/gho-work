/**
 * SubagentProgressBridge — maps SDK subagent events to InfoPanel progress state.
 *
 * Pure functions that process subagent lifecycle events and return
 * standalone update results (plan step correlation removed).
 */
import type { AgentEvent } from '@gho-work/base';
import type { InfoPanelState } from './infoPanelState.js';

/**
 * Result of processing a subagent event against the current state.
 * If `standalone` is defined, it's a subagent without a plan.
 */
export interface SubagentUpdateResult {
  standalone?: { name: string; displayName: string; state: 'active' | 'completed' | 'failed'; error?: string };
}

/**
 * Maps a subagent event to a standalone update.
 */
export function processSubagentEvent(
  event: AgentEvent,
  _state: InfoPanelState,
): SubagentUpdateResult | null {
  if (event.type === 'subagent_started') {
    return {
      standalone: { name: event.name, displayName: event.displayName, state: 'active' },
    };
  }

  if (event.type === 'subagent_completed') {
    return {
      standalone: { name: event.name, displayName: event.displayName, state: 'completed' },
    };
  }

  if (event.type === 'subagent_failed') {
    return {
      standalone: { name: event.name, displayName: event.name, state: 'failed', error: event.error },
    };
  }

  return null;
}
