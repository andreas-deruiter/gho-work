/**
 * InfoPanel state model and tool classification helpers.
 * Manages per-conversation state for the info panel sections.
 */

const INPUT_TOOL_NAMES = new Set([
  'readFile', 'read_file', 'searchFiles', 'search_files',
  'listDirectory', 'list_directory', 'readDir', 'read_dir',
  'getFileContents', 'get_file_contents',
]);

const OUTPUT_TOOL_NAMES = new Set([
  'writeFile', 'write_file', 'createFile', 'create_file',
  'editFile', 'edit_file', 'updateFile', 'update_file',
  'saveFile', 'save_file',
]);

export function isInputTool(toolName: string, serverName: string): boolean {
  if (serverName) { return true; }
  return INPUT_TOOL_NAMES.has(toolName);
}

export function isOutputTool(toolName: string): boolean {
  return OUTPUT_TOOL_NAMES.has(toolName);
}

export function extractInputName(toolName: string, serverName: string, args: Record<string, unknown>): string {
  if (serverName) { return `${serverName} / ${toolName}`; }
  for (const key of ['path', 'filePath', 'file']) {
    const val = args[key];
    if (typeof val === 'string' && val) {
      const parts = val.split(/[/\\]/);
      return parts[parts.length - 1] || val;
    }
  }
  return toolName;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${Math.round(bytes / 1024)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type StepState = 'completed' | 'active' | 'pending' | 'failed';

export interface PlanStep {
  id: string; label: string; state: StepState;
  startedAt?: number; completedAt?: number; error?: string; messageId?: string;
  agentName?: string;
}

export interface PlanState { id: string; steps: PlanStep[]; }

export interface InputEntry {
  name: string; path: string; messageId: string; kind: 'file' | 'tool'; count: number;
}

export interface OutputEntry {
  name: string; path: string; size: number; action: 'created' | 'modified'; messageId: string;
}

export interface ContextSourceEntry {
  path: string;
  origin: 'user' | 'project' | string;
  format: string;
}

export interface RegisteredAgentEntry {
  name: string;
  plugin: string;
}

export class InfoPanelState {
  private _plan: PlanState | null = null;
  private _inputs: InputEntry[] = [];
  private _outputs: OutputEntry[] = [];
  private _toolCalls = new Map<string, { toolName: string; serverName: string }>();
  /** Per-session context — survives clear() calls. */
  private _contextSources: ContextSourceEntry[] = [];
  private _registeredAgents: RegisteredAgentEntry[] = [];

  get plan(): PlanState | null { return this._plan; }
  get inputs(): readonly InputEntry[] { return this._inputs; }
  get outputs(): readonly OutputEntry[] { return this._outputs; }
  get contextSources(): readonly ContextSourceEntry[] { return this._contextSources; }
  get registeredAgents(): readonly RegisteredAgentEntry[] { return this._registeredAgents; }

  setContextSources(sources: ContextSourceEntry[]): void {
    this._contextSources = [...sources];
  }

  setRegisteredAgents(agents: RegisteredAgentEntry[]): void {
    this._registeredAgents = [...agents];
  }

  setPlan(plan: { id: string; steps: Array<{ id: string; label: string }> }): void {
    this._plan = { id: plan.id, steps: plan.steps.map(s => ({ ...s, state: 'pending' as StepState })) };
  }

  updateStep(stepId: string, state: StepState, meta?: { startedAt?: number; completedAt?: number; error?: string; messageId?: string }): void {
    if (!this._plan) { return; }
    const step = this._plan.steps.find(s => s.id === stepId);
    if (!step) { return; }
    step.state = state;
    if (meta?.startedAt !== undefined) { step.startedAt = meta.startedAt; }
    if (meta?.completedAt !== undefined) { step.completedAt = meta.completedAt; }
    if (meta?.error !== undefined) { step.error = meta.error; }
    if (meta?.messageId !== undefined) { step.messageId = meta.messageId; }
  }

  addInput(entry: Omit<InputEntry, 'count'>): void {
    const existing = this._inputs.find(e => e.path === entry.path);
    if (existing) { existing.count++; return; }
    this._inputs.push({ ...entry, count: 1 });
  }

  addOutput(entry: OutputEntry): void {
    const existing = this._outputs.find(e => e.path === entry.path);
    if (existing) { existing.size = entry.size; existing.action = 'modified'; return; }
    this._outputs.push(entry);
  }

  trackToolCall(toolCallId: string, toolName: string, serverName: string): void {
    this._toolCalls.set(toolCallId, { toolName, serverName });
  }

  getToolInfo(toolCallId: string): { toolName: string; serverName: string } | undefined {
    return this._toolCalls.get(toolCallId);
  }

  clear(): void {
    this._plan = null; this._inputs = []; this._outputs = []; this._toolCalls.clear();
  }
}
