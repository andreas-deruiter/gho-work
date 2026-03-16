/**
 * InfoPanel composite widget — brings together all 7 info sections into a
 * single auto-hiding panel with per-conversation state management.
 *
 * Dispatches AgentEvent to the appropriate child section and manages
 * visibility, conversation switching, and aggregated events.
 */
import { Emitter, DisposableStore } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';
import { TodoListWidget } from './todoListWidget.js';
import { InputSection } from './inputSection.js';
import { OutputSection } from './outputSection.js';
import { ContextSection } from './contextSection.js';
import { AgentsSection } from './agentsSection.js';
import { SkillsSection } from './skillsSection.js';
import { UsageSection } from './usageSection.js';
import type { UsageData } from './usageSection.js';
import { InfoPanelState, isInputTool, extractInputName } from './infoPanelState.js';
import type { InputEntry, OutputEntry } from './infoPanelState.js';

export class InfoPanel extends Widget {
  // --- Emitters ---
  private readonly _onDidRequestScrollToMessage = this._register(new Emitter<string>());
  readonly onDidRequestScrollToMessage: Event<string> = this._onDidRequestScrollToMessage.event;

  private readonly _onDidRequestRevealFile = this._register(new Emitter<string>());
  readonly onDidRequestRevealFile: Event<string> = this._onDidRequestRevealFile.event;

  private readonly _onDidTodosReceived = this._register(new Emitter<void>());
  readonly onDidTodosReceived: Event<void> = this._onDidTodosReceived.event;

  private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
  readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

  // --- Child sections ---
  private _todoSection: TodoListWidget;
  private _agentsSection: AgentsSection;
  private _skillsSection: SkillsSection;
  private _inputSection: InputSection;
  private _outputSection: OutputSection;
  private _contextSection: ContextSection;
  private _usageSection: UsageSection;

  // --- Per-conversation state ---
  private readonly _stateMap = new Map<string, InfoPanelState>();
  private _currentConversationId: string | null = null;
  private _currentState: InfoPanelState = new InfoPanelState();

  /** Disposable store for section widgets — cleared on conversation switch. */
  private _sectionStore = this._register(new DisposableStore());

  constructor() {
    const layout = h('div.info-panel@root');
    super(layout.root);

    // ARIA
    this.element.setAttribute('role', 'complementary');
    this.element.setAttribute('aria-label', 'Task info');

    // Create all 7 sections
    this._todoSection = this._createTodoSection();
    this._agentsSection = this._createSection(new AgentsSection(), 'agents');
    this._skillsSection = this._createSection(new SkillsSection(), 'skills');
    this._inputSection = this._createInputSection();
    this._outputSection = this._createOutputSection();
    this._contextSection = this._createSection(new ContextSection(), 'context');
    this._usageSection = this._createSection(new UsageSection(), 'usage');

    // Auto-hide initially (no data)
    this.element.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Dispatch an agent event to the appropriate section(s). */
  handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'todo_list_updated': {
        const hadTodos = this._currentState.todos.length > 0;
        this._currentState.setTodos(event.todos);
        this._todoSection.setTodos(event.todos);
        this._updateVisibility();
        if (!hadTodos && event.todos.length > 0) {
          this._onDidTodosReceived.fire();
        }
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
          this._updateVisibility();
        }
        break;
      }

      case 'tool_call_result': {
        if (event.fileMeta) {
          const { path, size, action } = event.fileMeta;
          const name = path.split(/[/\\]/).pop() || path;
          const outputEntry: OutputEntry = {
            name,
            path,
            size,
            action,
            messageId: '',
          };
          this._currentState.addOutput(outputEntry);
          this._outputSection.addEntry(outputEntry);
          this._updateVisibility();
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
        this._updateVisibility();
        break;
      }

      case 'skill_invoked': {
        this._skillsSection.updateSkill(event.skillName, event.state);
        this._currentState.setSkills(this._skillsSection.getSkillEntries());
        this._updateVisibility();
        break;
      }

      case 'subagent_started': {
        this._agentsSection.addAgent(event.parentToolCallId, event.name, event.displayName);
        this._currentState.setAgents(this._agentsSection.getAgentEntries());
        this._updateVisibility();
        break;
      }

      case 'subagent_completed': {
        this._agentsSection.updateAgent(event.parentToolCallId, event.state);
        this._currentState.setAgents(this._agentsSection.getAgentEntries());
        this._updateVisibility();
        break;
      }

      case 'subagent_failed': {
        this._agentsSection.updateAgent(event.parentToolCallId, 'failed', event.error);
        this._currentState.setAgents(this._agentsSection.getAgentEntries());
        this._updateVisibility();
        break;
      }

      case 'context_loaded': {
        this._currentState.setContextSources(event.sources);
        this._currentState.setRegisteredAgents(event.agents);
        this._contextSection.setSources(event.sources);
        this._contextSection.setAgents(event.agents);
        if (event.skills) {
          this._contextSection.setSkills(event.skills);
        }
        this._updateVisibility();
        break;
      }

      default:
        break;
    }
  }

  /**
   * Handle quota/usage data update from workbench.
   */
  handleQuotaChanged(data: UsageData): void {
    this._usageSection.update(data);
    this._currentState.setUsageData(data);
    this._updateVisibility();
  }

  /**
   * Handle MCP connector status update from workbench.
   */
  handleConnectorStatus(name: string, status: string, type: string, error?: string): void {
    this._contextSection.updateServer(name, status, type, error);
    this._updateVisibility();
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
    this._updateVisibility();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Generic section helper: registers in sectionStore, appends to panel,
   * and wires collapse-state tracking if section has `onDidToggle`.
   */
  private _createSection<T extends { getDomNode(): HTMLElement; onDidToggle?: Event<boolean> }>(
    section: T,
    name: string,
  ): T {
    this._sectionStore.add(section as any);
    this.element.appendChild(section.getDomNode());

    if ('onDidToggle' in section && typeof section.onDidToggle === 'function') {
      this._sectionStore.add(
        (section.onDidToggle as Event<boolean>)((collapsed) => {
          this._currentState.setCollapsed(name, collapsed);
        }),
      );
    }

    return section;
  }

  private _createTodoSection(): TodoListWidget {
    const section = this._sectionStore.add(new TodoListWidget());
    this.element.appendChild(section.getDomNode());
    return section;
  }

  private _createInputSection(): InputSection {
    const section = this._sectionStore.add(new InputSection());
    this.element.appendChild(section.getDomNode());

    this._sectionStore.add(section.onDidClickEntry((messageId) => {
      this._onDidRequestScrollToMessage.fire(messageId);
    }));

    if ('onDidToggle' in section && typeof section.onDidToggle === 'function') {
      this._sectionStore.add(
        (section.onDidToggle as Event<boolean>)((collapsed) => {
          this._currentState.setCollapsed('input', collapsed);
        }),
      );
    }

    return section;
  }

  private _createOutputSection(): OutputSection {
    const section = this._sectionStore.add(new OutputSection());
    this.element.appendChild(section.getDomNode());

    this._sectionStore.add(section.onDidClickEntry((messageId) => {
      this._onDidRequestScrollToMessage.fire(messageId);
    }));
    this._sectionStore.add(section.onDidRequestReveal((path) => {
      this._onDidRequestRevealFile.fire(path);
    }));

    if ('onDidToggle' in section && typeof section.onDidToggle === 'function') {
      this._sectionStore.add(
        (section.onDidToggle as Event<boolean>)((collapsed) => {
          this._currentState.setCollapsed('output', collapsed);
        }),
      );
    }

    return section;
  }

  /**
   * Tear down existing section widgets and rebuild from current state.
   * This is called on conversation switch to reflect the loaded state.
   */
  private _rebuildSections(): void {
    // Dispose old section widgets and their event subscriptions
    this._sectionStore.clear();

    // Clear DOM
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }

    // Recreate section widgets
    this._todoSection = this._createTodoSection();
    this._agentsSection = this._createSection(new AgentsSection(), 'agents');
    this._skillsSection = this._createSection(new SkillsSection(), 'skills');
    this._inputSection = this._createInputSection();
    this._outputSection = this._createOutputSection();
    this._contextSection = this._createSection(new ContextSection(), 'context');
    this._usageSection = this._createSection(new UsageSection(), 'usage');

    const state = this._currentState;

    // Restore collapse state
    for (const [sectionName, collapsed] of state.collapseState) {
      switch (sectionName) {
        case 'agents': this._agentsSection.setCollapsed(collapsed); break;
        case 'skills': this._skillsSection.setCollapsed(collapsed); break;
        case 'context': this._contextSection.setCollapsed(collapsed); break;
        case 'usage': this._usageSection.setCollapsed(collapsed); break;
        // input/output collapse state wired via their sections' own setCollapsed if they support it
      }
    }

    // Replay agents
    if (state.agents.length > 0) {
      this._agentsSection.setAgents([...state.agents]);
    }

    // Replay skills
    if (state.skills.length > 0) {
      this._skillsSection.setSkills([...state.skills]);
    }

    // Replay usage
    if (state.usageData) {
      this._usageSection.update(state.usageData);
    }

    // Context data — replay sources, agents, servers
    if (state.contextSources.length > 0) {
      this._contextSection.setSources([...state.contextSources]);
    }
    if (state.registeredAgents.length > 0) {
      this._contextSection.setAgents([...state.registeredAgents]);
    }
    // NOTE: MCP servers are global — ContextSection keeps them internally across rebuilds

    // Replay todos
    if (state.todos.length > 0) {
      this._todoSection.setTodos([...state.todos]);
    }

    for (const input of state.inputs) {
      this._inputSection.addEntry(input);
    }

    for (const output of state.outputs) {
      this._outputSection.addEntry(output);
    }
  }

  /** Show or hide the panel based on whether any section has data. */
  private _updateVisibility(): void {
    const sections = [
      this._todoSection,
      this._agentsSection,
      this._skillsSection,
      this._inputSection,
      this._outputSection,
      this._contextSection,
      this._usageSection,
    ];
    const anyVisible = sections.some(s => s.getDomNode().style.display !== 'none');
    const wasVisible = this.element.style.display !== 'none';
    this.element.style.display = anyVisible ? '' : 'none';
    if (wasVisible !== anyVisible) {
      this._onDidChangeVisibility.fire(anyVisible);
    }
  }
}
