/**
 * ProgressSection widget — shows the agent plan as a smart-collapse stepper.
 *
 * Smart-collapse rules (for plans with >4 steps):
 * 1. All completed steps collapse into a single summary line ("N steps completed")
 * 2. The active step + next 2 pending steps are always visible
 * 3. Remaining pending steps are collapsed
 * 4. A progress bar at the bottom shows N/total completed
 * 5. For plans with ≤4 steps, show all steps normally
 */
import { Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h, addDisposableListener } from '../dom.js';
import type { PlanState, PlanStep, StepState } from './infoPanelState.js';

/** Threshold above which smart-collapse activates. */
const COLLAPSE_THRESHOLD = 4;

/** Remove all child nodes from an element safely (no innerHTML). */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export class ProgressSection extends Widget {
  private readonly _onDidClickStep = this._register(new Emitter<string>());
  readonly onDidClickStep: Event<string> = this._onDidClickStep.event;

  private readonly _listEl: HTMLElement;
  private readonly _progressBarFill: HTMLElement;
  private readonly _progressBarWrap: HTMLElement;
  private readonly _announcement: HTMLElement;

  private _currentPlan: PlanState | null = null;

  constructor() {
    const root = h('section.info-progress-section@root', [
      h('h3.info-section-header@header'),
      h('div.info-step-list@list'),
      h('div.info-progress-bar-wrap@barWrap', [
        h('div.info-progress-bar@bar'),
      ]),
      h('div.info-announcement@announce'),
    ]);

    super(root.root);

    // Cast typed refs
    this._listEl = root['list'];
    this._progressBarFill = root['bar'];
    this._progressBarWrap = root['barWrap'];
    this._announcement = root['announce'];

    const header = root['header'];
    header.textContent = 'Progress';

    // ARIA
    this._listEl.setAttribute('role', 'list');
    this._listEl.setAttribute('aria-label', 'Plan steps');
    this._announcement.setAttribute('aria-live', 'polite');
    this._announcement.setAttribute('aria-atomic', 'true');
    this._announcement.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)';

    // Hidden until a plan is set
    this.element.style.display = 'none';

    // Progress bar hidden by default
    this._progressBarWrap.style.display = 'none';
  }

  /** Set (or replace) the current plan and re-render. */
  setPlan(plan: PlanState): void {
    this._currentPlan = plan;
    this.element.style.display = '';
    this._render();
  }

  /** Update a single step's state without a full re-render. */
  updateStep(
    stepId: string,
    state: StepState,
    meta?: { startedAt?: number; completedAt?: number; error?: string; messageId?: string },
  ): void {
    if (!this._currentPlan) {
      return;
    }
    const step = this._currentPlan.steps.find(s => s.id === stepId);
    if (!step) {
      return;
    }
    step.state = state;
    if (meta?.startedAt !== undefined) { step.startedAt = meta.startedAt; }
    if (meta?.completedAt !== undefined) { step.completedAt = meta.completedAt; }
    if (meta?.error !== undefined) { step.error = meta.error; }
    if (meta?.messageId !== undefined) { step.messageId = meta.messageId; }
    this._render();
  }

  // -------------------------------------------------------------------------
  // Private rendering
  // -------------------------------------------------------------------------

  private _render(): void {
    if (!this._currentPlan) {
      return;
    }

    const { steps } = this._currentPlan;
    const useSmart = steps.length > COLLAPSE_THRESHOLD;

    // Clear existing content (safe — no innerHTML)
    clearChildren(this._listEl);

    if (useSmart) {
      this._renderSmart(steps);
    } else {
      this._renderAll(steps);
    }

    // Progress bar
    this._updateProgressBar(steps);
  }

  /** Render all steps without collapsing (≤4 steps). */
  private _renderAll(steps: PlanStep[]): void {
    for (const step of steps) {
      this._listEl.appendChild(this._makeStepEl(step));
    }
    this._progressBarWrap.style.display = 'none';
  }

  /**
   * Smart-collapse rendering (>4 steps):
   * - Completed steps → single summary line
   * - Active + next 2 pending → visible
   * - Remaining pending → collapsed (not rendered individually)
   */
  private _renderSmart(steps: PlanStep[]): void {
    const completedSteps = steps.filter(s => s.state === 'completed' || s.state === 'failed');
    const activeIdx = steps.findIndex(s => s.state === 'active');

    // 1. Completed summary
    if (completedSteps.length > 0) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'info-step-summary';
      summaryEl.setAttribute('role', 'listitem');
      summaryEl.textContent = `${completedSteps.length} step${completedSteps.length !== 1 ? 's' : ''} completed`;
      this._listEl.appendChild(summaryEl);
    }

    // 2. Active step (if any)
    if (activeIdx !== -1) {
      this._listEl.appendChild(this._makeStepEl(steps[activeIdx]));
    }

    // 3. Next 2 pending steps after the active step
    const afterActive = activeIdx !== -1
      ? steps.slice(activeIdx + 1).filter(s => s.state === 'pending')
      : steps.filter(s => s.state === 'pending');
    const visiblePending = afterActive.slice(0, 2);
    for (const step of visiblePending) {
      this._listEl.appendChild(this._makeStepEl(step));
    }

    // 4. Remaining pending (collapsed — shown as count, not individually)
    const remainingPending = afterActive.slice(2);
    if (remainingPending.length > 0) {
      const remainEl = document.createElement('div');
      remainEl.className = 'info-step-remaining';
      remainEl.setAttribute('role', 'listitem');
      remainEl.textContent = `+${remainingPending.length} more step${remainingPending.length !== 1 ? 's' : ''}`;
      this._listEl.appendChild(remainEl);
    }
  }

  /** Build a single step list item element. */
  private _makeStepEl(step: PlanStep): HTMLElement {
    const el = document.createElement('div');
    el.className = `info-step info-step--${step.state}`;
    el.setAttribute('role', 'listitem');
    el.setAttribute('data-step-id', step.id);

    if (step.state === 'active') {
      el.setAttribute('aria-current', 'step');
    }

    // Track column: circle + connector line
    const track = document.createElement('span');
    track.className = 'info-step-track';
    track.setAttribute('aria-hidden', 'true');

    const circle = document.createElement('span');
    circle.className = `info-step-circle info-step-circle--${step.state}`;
    if (step.state === 'completed') {
      circle.textContent = '\u2713'; // checkmark
    } else if (step.state === 'failed') {
      circle.textContent = '\u2717'; // X mark
    }
    track.appendChild(circle);

    const line = document.createElement('span');
    line.className = `info-step-line info-step-line--${step.state === 'completed' || step.state === 'failed' ? 'completed' : 'pending'}`;
    track.appendChild(line);

    // Label
    const label = document.createElement('span');
    label.className = `info-step-label${step.state === 'completed' ? ' info-step-label--completed' : ''}`;
    label.textContent = step.label;

    el.appendChild(track);
    el.appendChild(label);

    if (step.error) {
      const errorEl = document.createElement('span');
      errorEl.className = 'info-step-error';
      errorEl.textContent = step.error;
      el.appendChild(errorEl);
    }

    // Click handler — only if messageId is present
    if (step.messageId) {
      const messageId = step.messageId;
      el.style.cursor = 'pointer';
      el.setAttribute('tabindex', '0');
      this._register(addDisposableListener(el, 'click', () => {
        this._onDidClickStep.fire(messageId);
      }));
      this._register(addDisposableListener(el, 'keydown', (e) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          this._onDidClickStep.fire(messageId);
        }
      }));
    }

    return el;
  }

  /** Show/update the progress bar for long plans. */
  private _updateProgressBar(steps: PlanStep[]): void {
    const useSmart = steps.length > COLLAPSE_THRESHOLD;
    if (!useSmart) {
      this._progressBarWrap.style.display = 'none';
      return;
    }

    const completed = steps.filter(s => s.state === 'completed' || s.state === 'failed').length;
    const pct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;

    this._progressBarWrap.style.display = '';
    this._progressBarFill.style.width = `${pct}%`;
    this._progressBarWrap.setAttribute('aria-label', `${completed} of ${steps.length} steps completed`);
    this._progressBarWrap.setAttribute('role', 'progressbar');
    this._progressBarWrap.setAttribute('aria-valuenow', String(completed));
    this._progressBarWrap.setAttribute('aria-valuemin', '0');
    this._progressBarWrap.setAttribute('aria-valuemax', String(steps.length));

    // Announce to screen readers on significant changes
    this._announcement.textContent = `${completed} of ${steps.length} steps completed`;
  }
}
