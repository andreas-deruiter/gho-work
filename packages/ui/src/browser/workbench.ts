/**
 * Main workbench — VS Code-style DOM-based UI shell.
 * Sets up the top-level layout and panels using Widget pattern.
 */
import { Disposable } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import { h } from './dom.js';
import { ActivityBar } from './activityBar.js';
import { StatusBar } from './statusBar.js';
import { KeyboardShortcuts } from './keyboardShortcuts.js';
import { ChatPanel } from './chatPanel.js';
import { ConversationListPanel } from './conversationList.js';
import { ConnectorsPanel } from './connectorsPanel.js';

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  private _chatPanel!: ChatPanel;
  private _conversationList!: ConversationListPanel;
  private _connectorsPanel!: ConnectorsPanel;
  private _sidebarVisible = true;
  private _sidebarEl!: HTMLElement;
  private _mainEl!: HTMLElement;
  private _conversationListEl!: HTMLElement;
  private _connectorsPanelEl!: HTMLElement;

  constructor(
    private readonly _container: HTMLElement,
    private readonly _ipc: IIPCRenderer,
  ) {
    super();
    this._activityBar = this._register(new ActivityBar());
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
    this._sidebarEl = layout.sidebar;
    this._mainEl = layout.main;

    // --- Sidebar: conversation list (shown when chat is active) ---
    this._conversationListEl = document.createElement('div');
    this._sidebarEl.appendChild(this._conversationListEl);
    this._conversationList = this._register(new ConversationListPanel(this._ipc));
    this._conversationList.render(this._conversationListEl);

    this._conversationList.onDidSelectConversation((conversationId) => {
      void this._chatPanel.loadConversation(conversationId);
    });

    this._conversationList.onDidRequestNewConversation(() => {
      void this._createNewConversation();
    });

    // --- Chat panel in main content ---
    this._chatPanel = this._register(new ChatPanel(this._ipc));
    this._chatPanel.render(layout.main);

    // --- Connectors panel (hidden by default, shown when connectors is active) ---
    this._connectorsPanel = this._register(new ConnectorsPanel(this._ipc));
    this._connectorsPanelEl = document.createElement('div');
    this._connectorsPanelEl.style.display = 'none';
    layout.main.appendChild(this._connectorsPanelEl);
    this._connectorsPanel.render(this._connectorsPanelEl);

    // When the connectors panel requests to open a conversation, switch to chat
    this._register(this._connectorsPanel.onDidRequestOpenConversation((conversationId) => {
      void this._openInstallConversation(conversationId);
    }));

    // --- Activity bar panel switching ---
    this._register(this._activityBar.onDidSelectItem((item) => {
      this._switchToPanel(item);
    }));

    // Status bar
    const statusBarWrapper = h('div.workbench-statusbar');
    statusBarWrapper.root.appendChild(this._statusBar.getDomNode());

    const wrapper = h('div.workbench-wrapper', [
      layout,
      statusBarWrapper,
    ]);

    this._container.appendChild(wrapper.root);

    // Status bar items
    this._statusBar.addLeftItem('Ready');
    this._statusBar.addRightItem('Copilot SDK');
  }

  private _switchToPanel(item: import('./activityBar.js').ActivityBarItem): void {
    const chatPanelEl = this._mainEl.querySelector('.chat-panel') as HTMLElement | null;
    if (item === 'connectors') {
      if (chatPanelEl) {
        chatPanelEl.style.display = 'none';
      }
      this._connectorsPanelEl.style.display = '';
      this._conversationListEl.style.display = 'none';
    } else {
      // Default: show chat for all other items
      if (chatPanelEl) {
        chatPanelEl.style.display = '';
      }
      this._connectorsPanelEl.style.display = 'none';
      this._conversationListEl.style.display = '';
    }
  }

  private async _openInstallConversation(conversationId: string): Promise<void> {
    try {
      // Switch activity bar and panels to chat view
      this._activityBar.setActiveItem('chat');
      this._switchToPanel('chat');

      await this._chatPanel.loadConversation(conversationId);
      await this._conversationList.refresh();
    } catch (err) {
      console.error('Failed to open install conversation:', err);
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
    if (this._sidebarEl) {
      this._sidebarEl.style.display = this._sidebarVisible ? '' : 'none';
    }
  }
}
