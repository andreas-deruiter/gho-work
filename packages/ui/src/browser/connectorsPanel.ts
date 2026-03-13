/**
 * Connectors panel — shows CLI tool status, with Install buttons for missing tools.
 * VS Code-style direct DOM manipulation with event-driven updates.
 */
import { Disposable, Emitter } from '@gho-work/base';
import type { Event, AgentEvent } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { CLIDetectResponse } from '@gho-work/platform/common';

export class ConnectorsPanel extends Disposable {
	private _containerEl!: HTMLElement;
	private _toolListEl!: HTMLElement;

	/** Tracks conversationIds started by Install buttons, for post-install refresh. */
	private readonly _installConversationIds = new Set<string>();

	/** Fired when the panel wants to open a conversation in the chat panel. */
	private readonly _onDidRequestOpenConversation = this._register(new Emitter<string>());
	readonly onDidRequestOpenConversation: Event<string> = this._onDidRequestOpenConversation.event;

	constructor(private readonly _ipc: IIPCRenderer) {
		super();
		// Listen for agent events so we can refresh after an install conversation completes
		this._ipc.on(IPC_CHANNELS.AGENT_EVENT, (...args: unknown[]) => {
			const event = args[0] as AgentEvent;
			this._handleAgentEvent(event);
		});
	}

	render(container: HTMLElement): void {
		this._containerEl = container;
		this._containerEl.className = 'connectors-panel';

		const header = document.createElement('div');
		header.className = 'connectors-panel-header';

		const title = document.createElement('h2');
		title.textContent = 'Connectors';
		header.appendChild(title);

		const refreshBtn = document.createElement('button');
		refreshBtn.className = 'connectors-refresh-btn';
		refreshBtn.title = 'Refresh';
		refreshBtn.textContent = '\u21BB'; // ↻
		refreshBtn.addEventListener('click', () => void this._load());
		header.appendChild(refreshBtn);

		this._containerEl.appendChild(header);

		const section = document.createElement('div');
		section.className = 'connectors-section';

		const sectionTitle = document.createElement('h3');
		sectionTitle.className = 'connectors-section-title';
		sectionTitle.textContent = 'CLI Tools';
		section.appendChild(sectionTitle);

		this._toolListEl = document.createElement('div');
		this._toolListEl.className = 'cli-tool-list';
		section.appendChild(this._toolListEl);

		this._containerEl.appendChild(section);

		void this._load();
	}

	private async _load(): Promise<void> {
		this._renderLoading();
		try {
			const response = await this._ipc.invoke<CLIDetectResponse>(IPC_CHANNELS.CLI_DETECT_ALL);
			this._renderTools(response.tools);
		} catch {
			this._renderError();
		}
	}

	private _clearToolList(): void {
		while (this._toolListEl.firstChild) {
			this._toolListEl.removeChild(this._toolListEl.firstChild);
		}
	}

	private _renderLoading(): void {
		this._clearToolList();
		const loading = document.createElement('div');
		loading.className = 'cli-tool-loading';
		loading.textContent = 'Detecting CLI tools\u2026';
		this._toolListEl.appendChild(loading);
	}

	private _renderError(): void {
		this._clearToolList();
		const error = document.createElement('div');
		error.className = 'cli-tool-error';
		error.textContent = 'Failed to detect CLI tools.';
		this._toolListEl.appendChild(error);
	}

	private _renderTools(tools: CLIDetectResponse['tools']): void {
		this._clearToolList();

		if (tools.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'cli-tool-empty';
			empty.textContent = 'No CLI tools detected.';
			this._toolListEl.appendChild(empty);
			return;
		}

		for (const tool of tools) {
			const item = document.createElement('div');
			item.className = `cli-tool-item ${tool.installed ? 'installed' : 'missing'}`;

			const statusIcon = document.createElement('span');
			statusIcon.className = `cli-tool-status-icon ${tool.installed ? 'installed' : 'missing'}`;
			statusIcon.textContent = tool.installed ? '\u2713' : '\u2717'; // ✓ or ✗
			item.appendChild(statusIcon);

			const info = document.createElement('div');
			info.className = 'cli-tool-info';

			const nameLine = document.createElement('div');
			nameLine.className = 'cli-tool-name-line';

			const name = document.createElement('span');
			name.className = 'cli-tool-name';
			name.textContent = tool.name;
			nameLine.appendChild(name);

			if (tool.installed && tool.version) {
				const version = document.createElement('span');
				version.className = 'cli-tool-version';
				version.textContent = `v${tool.version}`;
				nameLine.appendChild(version);
			}

			info.appendChild(nameLine);

			if (!tool.installed) {
				const action = document.createElement('div');
				action.className = 'cli-tool-action';

				const installBtn = document.createElement('button');
				installBtn.className = 'cli-install-btn';
				installBtn.textContent = 'Install';
				installBtn.addEventListener('click', () => void this._handleInstallClick(tool.id));
				action.appendChild(installBtn);

				item.appendChild(info);
				item.appendChild(action);
			} else {
				item.appendChild(info);
			}

			this._toolListEl.appendChild(item);
		}
	}

	private async _handleInstallClick(toolId: string): Promise<void> {
		try {
			const result = await this._ipc.invoke<{ conversationId: string }>(
				IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
				{ query: toolId },
			);

			// Track this conversation so we know to refresh when it completes
			this._installConversationIds.add(result.conversationId);

			// Navigate to the newly created install conversation
			this._onDidRequestOpenConversation.fire(result.conversationId);
		} catch (err) {
			console.error('[ConnectorsPanel] Failed to create install conversation:', err);
		}
	}

	private _handleAgentEvent(event: AgentEvent): void {
		if (event.type !== 'done') {
			return;
		}
		// The 'done' event has no conversationId, so we check whether any install
		// conversation is the currently active one by relying on a flag pattern:
		// refresh if any install conversation is pending (the active one just completed).
		if (this._installConversationIds.size > 0) {
			// We optimistically refresh CLI detection after any 'done' while installs are pending.
			// The conversation that just finished was most likely the active install conversation.
			// A more precise approach would require the chatPanel to expose its active conversation ID.
			void this._load();
		}
	}
}
