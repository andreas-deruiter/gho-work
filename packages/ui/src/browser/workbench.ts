/**
 * Main workbench — VS Code-style DOM-based UI shell.
 * Sets up the top-level layout and panels using Widget pattern.
 */
import { Disposable } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { h } from './dom.js';
import { ActivityBar } from './activityBar.js';
import { Sidebar } from './sidebar.js';
import { StatusBar } from './statusBar.js';
import { KeyboardShortcuts } from './keyboardShortcuts.js';
import { ChatPanel } from './chatPanel.js';
import { ConversationListPanel } from './conversationList.js';
import { ConnectorSidebarWidget } from './connectors/connectorSidebar.js';
import { ConnectorDrawerWidget } from './connectors/connectorDrawer.js';

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  private readonly _sidebar: Sidebar;
  private _chatPanel!: ChatPanel;
  private _conversationList!: ConversationListPanel;
  private _connectorSidebar!: ConnectorSidebarWidget;
  private _connectorDrawer!: ConnectorDrawerWidget;
  private _sidebarVisible = true;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _ipc: IIPCRenderer,
  ) {
    super();
    this._activityBar = this._register(new ActivityBar());
    this._sidebar = this._register(new Sidebar());
    this._statusBar = this._register(new StatusBar());
    this._shortcuts = this._register(new KeyboardShortcuts());
    this._setupShortcuts();
  }

  render(): void {
    // Clear container safely
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }

    const layout = h('div.workbench', [
      h('div.workbench-activity-bar@activityBar'),
      h('div.workbench-sidebar@sidebar'),
      h('div.workbench-main@main'),
    ]);

    layout.activityBar.appendChild(this._activityBar.getDomNode());

    // Sidebar with panel switching
    layout.sidebar.appendChild(this._sidebar.getDomNode());

    // Chat panel in sidebar (default)
    this._conversationList = this._register(new ConversationListPanel(this._ipc));
    const chatSidebarContainer = document.createElement('div');
    chatSidebarContainer.className = 'sidebar-panel-chat';
    this._conversationList.render(chatSidebarContainer);
    this._sidebar.addPanel('chat', chatSidebarContainer);

    this._conversationList.onDidSelectConversation((conversationId) => {
      void this._chatPanel.loadConversation(conversationId);
    });
    this._conversationList.onDidRequestNewConversation(() => {
      void this._createNewConversation();
    });

    // Connector sidebar (lazy — activated on first selection)
    this._connectorSidebar = this._register(new ConnectorSidebarWidget(this._ipc));
    const connectorSidebarContainer = document.createElement('div');
    connectorSidebarContainer.className = 'sidebar-panel-connectors';
    connectorSidebarContainer.appendChild(this._connectorSidebar.getDomNode());
    this._sidebar.addPanel('connectors', connectorSidebarContainer);

    // Wire activity bar — activate connector sidebar lazily
    let connectorSidebarActivated = false;
    this._register(this._activityBar.onDidSelectItem(async (item) => {
      this._sidebar.showPanel(item);
      if (item === 'connectors' && !connectorSidebarActivated) {
        connectorSidebarActivated = true;
        await this._connectorSidebar.activate();
      }
    }));

    // Chat panel in main content
    this._chatPanel = this._register(new ChatPanel(this._ipc));
    this._chatPanel.render(layout.main);

    // Status bar
    const statusBarWrapper = h('div.workbench-statusbar');
    statusBarWrapper.root.appendChild(this._statusBar.getDomNode());

    // Title bar — drag region for macOS traffic lights
    const titleBar = h('div.title-bar', [
      h('div.title-bar-content', [
        h('span.title-bar-logo@logo'),
      ]),
    ]);
    titleBar.logo.textContent = 'GHO Work';

    const wrapper = h('div.workbench-wrapper', [
      layout,
      statusBarWrapper,
    ]);

    this._container.appendChild(titleBar.root);
    this._container.appendChild(wrapper.root);

    // Connector drawer (overlays main content)
    this._connectorDrawer = this._register(new ConnectorDrawerWidget(this._ipc));
    wrapper.root.appendChild(this._connectorDrawer.getDomNode());

    // Wire sidebar events to drawer
    this._connectorSidebar.onDidSelectConnector(async (id) => {
      this._connectorSidebar.highlightConnector(id);
      await this._connectorDrawer.openForConnector(id);
    });

    this._connectorSidebar.onDidRequestAddConnector(async () => {
      this._connectorSidebar.highlightConnector(null);
      try {
        const result = await this._ipc.invoke<{ conversationId: string; error?: string }>(
          IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
        );
        if (result.error) {
          this._chatPanel.showError(`Failed to start connector setup: ${result.error}`);
          return;
        }
        await this._openSetupConversation(result.conversationId);
      } catch (err) {
        console.error('[workbench] Setup conversation failed:', err);
        this._chatPanel.showError('Failed to start connector setup. Check that the agent service is running.');
      }
    });

    this._connectorDrawer.onDidClose(() => {
      this._connectorSidebar.highlightConnector(null);
    });

    // Handle CLI install from sidebar — create an install conversation
    this._connectorSidebar.onDidRequestInstallCLI(async (toolId) => {
      this._connectorSidebar.setCLIToolLoading(toolId, 'Starting...');
      try {
        const result = await this._ipc.invoke<{ conversationId: string; error?: string }>(
          IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION,
          { query: toolId },
        );
        const toolNames: Record<string, string> = {
          gh: 'GitHub CLI', pandoc: 'pandoc', git: 'git',
          mgc: 'Microsoft Graph CLI', az: 'Azure CLI',
          gcloud: 'Google Cloud CLI', workiq: 'Work IQ CLI',
        };
        // Refresh sidebar to clear loading spinner — conversation handles UX now
        await this._connectorSidebar.refreshCLITools();
        await this._openSetupConversation(result.conversationId, toolNames[toolId] ?? toolId);
      } catch (err) {
        console.error('[workbench] Install conversation failed:', err);
        await this._connectorSidebar.refreshCLITools();
        // Show error — do NOT silently fall back to opening a URL
        const toolNames: Record<string, string> = {
          gh: 'GitHub CLI', pandoc: 'pandoc', git: 'git',
          mgc: 'Microsoft Graph CLI', az: 'Azure CLI',
          gcloud: 'Google Cloud CLI', workiq: 'Work IQ CLI',
        };
        const name = toolNames[toolId] ?? toolId;
        this._chatPanel.showError(`Failed to start ${name} installation. Check that the agent service is running.`);
      }
    });

    // Handle CLI auth from sidebar — create auth conversation with device code
    this._connectorSidebar.onDidRequestAuthCLI(async (toolId) => {
      this._connectorSidebar.setCLIToolLoading(toolId, 'Starting...');
      try {
        const result = await this._ipc.invoke<{
          conversationId: string; authUrl?: string; deviceCode?: string;
        }>(IPC_CHANNELS.CLI_CREATE_AUTH_CONVERSATION, { toolId });
        const toolNames: Record<string, string> = {
          gh: 'GitHub CLI', mgc: 'Microsoft Graph CLI', az: 'Azure CLI',
          gcloud: 'Google Cloud CLI', workiq: 'Work IQ CLI',
        };
        // Refresh sidebar to clear loading spinner — conversation handles UX now
        await this._connectorSidebar.refreshCLITools();
        await this._openAuthConversation(
          result.conversationId,
          toolNames[toolId] ?? toolId,
          result.authUrl,
          result.deviceCode,
        );
      } catch (err) {
        console.error(`[workbench] Auth conversation failed for ${toolId}:`, err);
        await this._connectorSidebar.refreshCLITools();
      }
    });

    // Handle save/delete from drawer
    this._connectorDrawer.onDidSaveConnector(async (data) => {
      const existing = await this._ipc.invoke<{ connectors: Array<{ id: string }> }>(IPC_CHANNELS.CONNECTOR_LIST);
      const isNew = !existing.connectors.some(c => c.id === data.id);
      if (isNew) {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_ADD, {
          id: data.id, type: 'local_mcp', name: data.name, transport: data.transport,
          command: data.command, args: data.args, url: data.url, env: data.env, headers: data.headers,
          enabled: true, status: 'disconnected',
        });
      } else {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_UPDATE, { id: data.id, updates: data });
      }
      await this._connectorSidebar.refreshConnectors();
    });

    this._connectorDrawer.onDidDeleteConnector(async (id) => {
      await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_REMOVE, { id });
      this._connectorDrawer.close();
      await this._connectorSidebar.refreshConnectors();
    });

    // Status bar items
    this._statusBar.addLeftItem('Ready');
    this._statusBar.addRightItem('Copilot SDK');
  }

  private async _openSetupConversation(conversationId: string, toolName?: string): Promise<void> {
    try {
      // Switch activity bar and panels to chat view
      this._activityBar.setActiveItem('chat');
      this._sidebar.showPanel('chat');

      await this._chatPanel.loadConversation(conversationId);
      await this._conversationList.refresh();

      // Auto-send kickoff message to trigger the setup skill
      const name = toolName ?? 'a connector';
      await this._chatPanel.sendMessage(`Help me set up ${name}.`);
    } catch (err) {
      console.error('Failed to open setup conversation:', err);
    }
  }

  private async _openAuthConversation(
    conversationId: string,
    toolName: string,
    authUrl?: string,
    deviceCode?: string,
  ): Promise<void> {
    try {
      this._activityBar.setActiveItem('chat');
      this._sidebar.showPanel('chat');

      await this._chatPanel.loadConversation(conversationId);
      await this._conversationList.refresh();

      // Send kickoff message — agent will show device code BEFORE user opens browser
      let kickoff = `Help me authenticate ${toolName}.`;
      if (deviceCode) {
        kickoff += ` The device code is: ${deviceCode}.`;
      }
      if (authUrl) {
        kickoff += ` The auth URL is: ${authUrl}.`;
      }
      await this._chatPanel.sendMessage(kickoff);
    } catch (err) {
      console.error('Failed to open auth conversation:', err);
    }
  }

  private async _createNewConversation(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{ id: string; title: string }>(
        IPC_CHANNELS.CONVERSATION_CREATE,
      );
      this._chatPanel.conversationId = response.id;
      await this._chatPanel.loadConversation(response.id);
      await this._conversationList.refresh();
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }

  private _setupShortcuts(): void {
    this._shortcuts.bind({
      key: 'b',
      meta: true,
      handler: () => this._toggleSidebar(),
    });
    // Cmd+N for new conversation
    this._shortcuts.bind({
      key: 'n',
      meta: true,
      handler: () => void this._createNewConversation(),
    });
  }

  private _toggleSidebar(): void {
    this._sidebarVisible = !this._sidebarVisible;
    this._sidebar.getDomNode().style.display = this._sidebarVisible ? '' : 'none';
  }
}
