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

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  private readonly _sidebar: Sidebar;
  private _chatPanel!: ChatPanel;
  private _conversationList!: ConversationListPanel;
  private _connectorSidebar!: ConnectorSidebarWidget;
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

    // Wire connector sidebar events
    this._connectorSidebar.onDidRequestAddConnector(async () => {
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
        this._chatPanel.showError('Failed to start connector setup.');
      }
    });

    this._connectorSidebar.onDidRequestConnect(async (name) => {
      try {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_CONNECT, { name });
      } catch (err) {
        console.error('[workbench] Connect failed:', err);
      }
    });

    this._connectorSidebar.onDidRequestDisconnect(async (name) => {
      try {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_DISCONNECT, { name });
      } catch (err) {
        console.error('[workbench] Disconnect failed:', err);
      }
    });

    this._connectorSidebar.onDidRequestRemove(async (name) => {
      try {
        await this._ipc.invoke(IPC_CHANNELS.CONNECTOR_REMOVE, { name });
      } catch (err) {
        console.error('[workbench] Remove failed:', err);
      }
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
