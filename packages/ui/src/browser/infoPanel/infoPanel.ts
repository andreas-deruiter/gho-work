/**
 * InfoPanel composite widget — brings together ProgressSection, InputSection,
 * and OutputSection into a single panel with per-conversation state management.
 *
 * Dispatches AgentEvent to the appropriate child section and manages
 * empty-state messaging, conversation switching, and aggregated events.
 */
import { Emitter, DisposableStore } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { ProgressSection } from './progressSection.js';
import { InputSection } from './inputSection.js';
import { OutputSection } from './outputSection.js';
import { InfoPanelState, isInputTool, extractInputName } from './infoPanelState.js';
import type { InputEntry, OutputEntry } from './infoPanelState.js';

/** Remove all child nodes from an element. */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

export class InfoPanel extends Widget {
  // --- Emitters ---
  private readonly _onDidRequestScrollToMessage = this._register(new Emitter<string>());
  readonly onDidRequestScrollToMessage: Event<string> = this._onDidRequestScrollToMessage.event;

  private readonly _onDidRequestRevealFile = this._register(new Emitter<string>());
  readonly onDidRequestRevealFile: Event<string> = this._onDidRequestRevealFile.event;

  private readonly _onDidPlanCreated = this._register(new Emitter<void>());
  readonly onDidPlanCreated: Event<void> = this._onDidPlanCreated.event;

  // --- Child sections ---
  private _progressSection: ProgressSection;
  private _inputSection: InputSection;
  private _outputSection: OutputSection;

  // --- Section wrappers (for CSS targeting / test queries) ---
  private readonly _progressWrap: HTMLElement;
  private readonly _inputWrap: HTMLElement;
  private readonly _outputWrap: HTMLElement;
  private readonly _emptyEl: HTMLElement;

  // --- Per-conversation state ---
  private readonly _stateMap = new Map<string, InfoPanelState>();
  private _currentConversationId: string | null = null;
  private _currentState: InfoPanelState = new InfoPanelState();

  /** Disposable store for section widgets — cleared on conversation switch. */
  private _sectionStore = this._register(new DisposableStore());

  constructor() {
    const layout = h('div.info-panel@root', [
      h('div.info-panel-progress@progress'),
      h('div.info-panel-input@input'),
      h('div.info-panel-output@output'),
      h('div.info-panel-empty@empty'),
    ]);

    super(layout.root);

    this._progressWrap = layout['progress'];
    this._inputWrap = layout['input'];
    this._outputWrap = layout['output'];
    this._emptyEl = layout['empty'];

    // ARIA
    this.element.setAttribute('role', 'complementary');
    this.element.setAttribute('aria-label', 'Task info');

    // Empty state
    this._emptyEl.textContent = 'Panel will populate as the agent works';

    // Create child sections
    this._progressSection = this._createProgressSection();
    this._inputSection = this._createInputSection();
    this._outputSection = this._createOutputSection();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Dispatch an agent event to the appropriate section(s). */
  handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'plan_created': {
        this._currentState.setPlan(event.plan);
        this._progressSection.setPlan(this._currentState.plan!);
        this._updateEmptyState();
        this._onDidPlanCreated.fire();
        break;
      }

      case 'plan_step_updated': {
        // Map 'running' from AgentEvent to 'active' for StepState
        const stepState = event.state === 'running' ? 'active' : event.state;
        this._currentState.updateStep(event.stepId, stepState, {
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          error: event.error,
          messageId: event.messageId,
        });
        this._progressSection.updateStep(event.stepId, stepState, {
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          error: event.error,
          messageId: event.messageId,
        });
        break;
      }

      case 'tool_call_start': {
        const { id, toolName, serverName, arguments: args, messageId } = event.toolCall;
        // Always track the tool call for later result correlation
        this._currentState.trackToolCall(id, toolName, serverName);

        // Classify as input tool
        if (isInputTool(toolName, serverName)) {
          const displayName = extractInputName(toolName, serverName, args);
          const path = (typeof args['path'] === 'string' ? args['path'] : '') ||
                       (typeof args['filePath'] === 'string' ? args['filePath'] : '') ||
                       (typeof args['file'] === 'string' ? args['file'] : '') ||
                       toolName;
          const entry: Omit<InputEntry, 'count'> = {
            name: displayName,
            path,
            messageId,
            kind: serverName ? 'tool' : 'file',
          };
          this._currentState.addInput(entry);
          this._inputSection.addEntry({ ...entry, count: 1 });
          this._updateEmptyState();
        }
        break;
      }

      case 'tool_call_result': {
        if (event.fileMeta) {
          const { path, size, action } = event.fileMeta;
          const name = path.split(/[/\\]/).pop() || path;
          // Use tool call ID to find the messageId — fall back to empty string
          const outputEntry: OutputEntry = {
            name,
            path,
            size,
            action,
            messageId: '', // tool_call_result doesn't carry messageId directly
          };
          this._currentState.addOutput(outputEntry);
          this._outputSection.addEntry(outputEntry);
          this._updateEmptyState();
        }
        break;
      }

      case 'attachment_added': {
        const { name, path } = event.attachment;
        const entry: Omit<InputEntry, 'count'> = {
          name,
          path,
          messageId: event.messageId,
          kind: 'file',
        };
        this._currentState.addInput(entry);
        this._inputSection.addEntry({ ...entry, count: 1 });
        this._updateEmptyState();
        break;
      }

      // Other event types (text, thinking, error, done) are not handled by InfoPanel
      default:
        break;
    }
  }

  /**
   * Switch to a different conversation. Saves current state and loads
   * (or creates) state for the new conversation, re-rendering all sections.
   */
  setConversation(id: string | null): void {
    // Save current state
    if (this._currentConversationId !== null) {
      this._stateMap.set(this._currentConversationId, this._currentState);
    }

    // Load or create state for new conversation
    this._currentConversationId = id;
    if (id !== null && this._stateMap.has(id)) {
      this._currentState = this._stateMap.get(id)!;
    } else {
      this._currentState = new InfoPanelState();
      if (id !== null) {
        this._stateMap.set(id, this._currentState);
      }
    }

    // Re-render sections from loaded state
    this._rebuildSections();
    this._updateEmptyState();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _createProgressSection(): ProgressSection {
    const section = this._sectionStore.add(new ProgressSection());
    this._progressWrap.appendChild(section.getDomNode());

    // Wire click events
    this._sectionStore.add(section.onDidClickStep((messageId) => {
      this._onDidRequestScrollToMessage.fire(messageId);
    }));

    return section;
  }

  private _createInputSection(): InputSection {
    const section = this._sectionStore.add(new InputSection());
    this._inputWrap.appendChild(section.getDomNode());

    this._sectionStore.add(section.onDidClickEntry((messageId) => {
      this._onDidRequestScrollToMessage.fire(messageId);
    }));

    return section;
  }

  private _createOutputSection(): OutputSection {
    const section = this._sectionStore.add(new OutputSection());
    this._outputWrap.appendChild(section.getDomNode());

    this._sectionStore.add(section.onDidClickEntry((messageId) => {
      this._onDidRequestScrollToMessage.fire(messageId);
    }));
    this._sectionStore.add(section.onDidRequestReveal((path) => {
      this._onDidRequestRevealFile.fire(path);
    }));

    return section;
  }

  /**
   * Tear down existing section widgets and rebuild from current state.
   * This is called on conversation switch to reflect the loaded state.
   */
  private _rebuildSections(): void {
    // Dispose old section widgets and their event subscriptions
    this._sectionStore.clear();

    // Clear DOM wrappers
    clearChildren(this._progressWrap);
    clearChildren(this._inputWrap);
    clearChildren(this._outputWrap);

    // Recreate section widgets
    this._progressSection = this._createProgressSection();
    this._inputSection = this._createInputSection();
    this._outputSection = this._createOutputSection();

    // Replay state into sections
    const state = this._currentState;

    if (state.plan) {
      this._progressSection.setPlan(state.plan);
    }

    for (const input of state.inputs) {
      this._inputSection.addEntry(input);
    }

    for (const output of state.outputs) {
      this._outputSection.addEntry(output);
    }
  }

  /** Show or hide the empty state message based on section data. */
  private _updateEmptyState(): void {
    const state = this._currentState;
    const hasData = state.plan !== null || state.inputs.length > 0 || state.outputs.length > 0;
    this._emptyEl.style.display = hasData ? 'none' : '';
  }
}
