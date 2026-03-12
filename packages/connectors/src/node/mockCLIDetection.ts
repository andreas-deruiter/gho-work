import { Disposable, Emitter } from '@gho-work/base';
import type { Event } from '@gho-work/base';
import type { ICLIDetectionService, CLIToolStatus } from '../common/cliDetection.js';

/**
 * Mock CLI detection service for --mock mode.
 * Returns synthetic tool data so the Connectors sidebar populates without
 * real CLI tools installed.
 */
const MOCK_TOOLS: CLIToolStatus[] = [
  { id: 'gh', name: 'GitHub CLI', installed: true, version: '2.67.0', authenticated: true, installUrl: 'https://cli.github.com', authCommand: 'gh auth login' },
  { id: 'git', name: 'git', installed: true, version: '2.44.0', installUrl: 'https://git-scm.com' },
  { id: 'pandoc', name: 'Pandoc', installed: false, installUrl: 'https://pandoc.org/installing.html' },
  { id: 'mgc', name: 'Microsoft Graph CLI', installed: false, installUrl: 'https://learn.microsoft.com/en-us/graph/cli/installation', authCommand: 'mgc login' },
  { id: 'az', name: 'Azure CLI', installed: false, installUrl: 'https://learn.microsoft.com/en-us/cli/azure/install-azure-cli', authCommand: 'az login' },
  { id: 'gcloud', name: 'Google Cloud CLI', installed: false, installUrl: 'https://cloud.google.com/sdk/docs/install', authCommand: 'gcloud auth login' },
  { id: 'workiq', name: 'Work IQ', installed: false, installUrl: 'https://workiq.microsoft.com', authCommand: 'workiq auth login' },
];

export class MockCLIDetectionService extends Disposable implements ICLIDetectionService {
  private readonly _onDidChangeTools = this._register(new Emitter<CLIToolStatus[]>());
  readonly onDidChangeTools: Event<CLIToolStatus[]> = this._onDidChangeTools.event;

  private _tools = MOCK_TOOLS.map(t => ({ ...t }));

  async detectAll(): Promise<CLIToolStatus[]> {
    return this._tools;
  }

  async detect(toolId: string): Promise<CLIToolStatus | undefined> {
    return this._tools.find(t => t.id === toolId);
  }

  async refresh(): Promise<void> {
    this._onDidChangeTools.fire(this._tools);
  }

  async installTool(toolId: string): Promise<{ success: boolean; installUrl?: string; error?: string }> {
    const tool = this._tools.find(t => t.id === toolId);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    // Simulate successful install
    tool.installed = true;
    tool.version = '1.0.0';
    this._onDidChangeTools.fire(this._tools);
    return { success: true, installUrl: tool.installUrl };
  }

  async authenticateTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    const tool = this._tools.find(t => t.id === toolId);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolId}` };
    }
    tool.authenticated = true;
    this._onDidChangeTools.fire(this._tools);
    return { success: true };
  }
}
