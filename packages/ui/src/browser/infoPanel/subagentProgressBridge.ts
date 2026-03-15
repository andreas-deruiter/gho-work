/**
 * SubagentProgressBridge — maps SDK subagent events to InfoPanel progress state.
 *
 * Pure functions that correlate subagent lifecycle events with plan steps
 * and update InfoPanelState accordingly.
 */
import type { AgentEvent } from '@gho-work/base';
import type { PlanStep, InfoPanelState } from './infoPanelState.js';

/**
 * Finds the next pending step in the plan — sequential assumption:
 * the next pending step is the one the subagent is working on.
 */
export function correlateSubagentToStep(steps: PlanStep[]): PlanStep | undefined {
  return steps.find(s => s.state === 'pending');
}

/**
 * Result of processing a subagent event against the current state.
 * If `step` is defined, that step was updated.
 * If `standalone` is defined, it's a subagent without a plan.
 */
export interface SubagentUpdateResult {
  step?: { id: string; state: 'active' | 'completed' | 'failed'; agentName?: string; error?: string };
  standalone?: { name: string; displayName: string; state: 'active' | 'completed' | 'failed'; error?: string };
}

/**
 * Maps a subagent event to a step or standalone update.
 */
export function processSubagentEvent(
  event: AgentEvent,
  state: InfoPanelState,
): SubagentUpdateResult | null {
  if (event.type === 'subagent_started') {
    const plan = state.plan;
    if (plan) {
      const step = correlateSubagentToStep(plan.steps);
      if (step) {
        return {
          step: { id: step.id, state: 'active', agentName: event.displayName },
        };
      }
    }
    // Subagent without plan — show as standalone
    return {
      standalone: { name: event.name, displayName: event.displayName, state: 'active' },
    };
  }

  if (event.type === 'subagent_completed') {
    const plan = state.plan;
    if (plan) {
      // Find the active step (the one we previously set to active for this subagent)
      const activeStep = plan.steps.find(s => s.state === 'active');
      if (activeStep) {
        return {
          step: { id: activeStep.id, state: 'completed' },
        };
      }
    }
    return {
      standalone: { name: event.name, displayName: event.displayName, state: 'completed' },
    };
  }

  if (event.type === 'subagent_failed') {
    const plan = state.plan;
    if (plan) {
      const activeStep = plan.steps.find(s => s.state === 'active');
      if (activeStep) {
        return {
          step: { id: activeStep.id, state: 'failed', error: event.error },
        };
      }
    }
    return {
      standalone: { name: event.name, displayName: event.displayName, state: 'failed', error: event.error },
    };
  }

  return null;
}
