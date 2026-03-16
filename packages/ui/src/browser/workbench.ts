/**
 * Main workbench — VS Code-style DOM-based UI shell.
 * Sets up the top-level layout and panels using Widget pattern.
 */
import { Disposable } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { ConnectorStatus } from './statusBar/connectorStatusItem.js';
import { h } from './dom.js';
import { ActivityBar } from './activityBar.js';
import { Sidebar } from './sidebar.js';
import { StatusBar } from './statusBar/statusBar.js';
import { KeyboardShortcuts } from './keyboardShortcuts.js';
import { ChatPanel } from './chatPanel.js';
import { ConversationListPanel } from './conversationList.js';
import { SettingsPanel } from './settings/settingsPanel.js';
import { ThemeService } from './theme.js';
import { FilesPanel } from './filesPanel.js';
import { InfoPanel } from './infoPanel/index.js';
import type { AgentEvent } from '@gho-work/base';

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  private readonly _sidebar: Sidebar;
  private _chatPanel!: ChatPanel;
  private _chatPanelEl!: HTMLElement;
  private _conversationList!: ConversationListPanel;
  private _sidebarVisible = true;
  private _settingsPanel: SettingsPanel | undefined;
  private _themeService!: ThemeService;
  private _mainEl!: HTMLElement;
  private _sidebarWrapperEl!: HTMLElement;
  private _infoPanel!: InfoPanel;
  private _infoPanelEl!: HTMLElement;
  private _infoPanelVisible = false;
  private _userCollapsedInfoPanel = false;

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
    this._sidebarWrapperEl = layout.sidebar;
    layout.sidebar.appendChild(this._sidebar.getDomNode());

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.classList.add('sidebar-resize-handle');
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(600, startWidth + (e.clientX - startX)));
      layout.sidebar.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = layout.sidebar.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    layout.sidebar.appendChild(resizeHandle);

    // Chat panel in sidebar (default)
    this._conversationList = this._register(new ConversationListPanel(this._ipc));
    const chatSidebarContainer = document.createElement('div');
    chatSidebarContainer.className = 'sidebar-panel-chat';
    this._conversationList.render(chatSidebarContainer);
    this._sidebar.addPanel('chat', chatSidebarContainer);

    this._conversationList.onDidSelectConversation((conversationId) => {
      void this._chatPanel.loadConversation(conversationId);
      this._infoPanel.setConversation(conversationId);
      this._userCollapsedInfoPanel = false;
    });
    this._conversationList.onDidRequestNewConversation(() => {
      void this._createNewConversation();
    });

    // Files panel — lazy-loaded
    let filesPanel: FilesPanel | undefined;
    let filesLoaded = false;

    void (async () => {
      try {
        const result = await this._ipc.invoke<{ path: string | null }>(IPC_CHANNELS.WORKSPACE_GET_ROOT, {});
        const workspacePath = result?.path;
        if (workspacePath) {
          filesPanel = this._register(new FilesPanel(workspacePath, this._ipc));
          this._sidebar.addPanel('files', filesPanel.getDomNode());

          // Wire attach event to chat
          filesPanel.onDidRequestAttach(file => {
            this._chatPanel.addAttachment(file);
          });
        }
      } catch (err) {
        console.warn('[Workbench] Failed to initialize files panel:', err);
      }
    })();

    // Theme service
    this._themeService = this._register(new ThemeService(this._ipc));
    void this._themeService.init();

    // Chat panel in main content — wrap in a container so we can hide/show it
    const chatPanelContainer = document.createElement('div');
    chatPanelContainer.className = 'workbench-chat-container';
    layout.main.appendChild(chatPanelContainer);
    this._chatPanelEl = chatPanelContainer;
    this._chatPanel = this._register(new ChatPanel(this._ipc));
    this._chatPanel.render(chatPanelContainer);

    // After agent response completes, refresh sidebar list and header title
    this._chatPanel.onDidFinishResponse(() => {
      void this._conversationList.refresh();
      void this._chatPanel.refreshTitle();
    });

    // Info panel container (must be declared before resize handle that references it)
    const infoPanelContainer = document.createElement('div');
    infoPanelContainer.className = 'info-panel-container';
    infoPanelContainer.style.display = 'none'; // hidden by default
    this._infoPanelEl = infoPanelContainer;

    this._infoPanel = this._register(new InfoPanel());
    infoPanelContainer.appendChild(this._infoPanel.getDomNode());

    // Info panel resize handle (on the left side of info panel)
    const infoPanelResizeHandle = document.createElement('div');
    infoPanelResizeHandle.classList.add('info-panel-resize-handle');
    let ipStartX = 0;
    let ipStartWidth = 0;

    const onInfoPanelMouseMove = (e: MouseEvent) => {
      // Dragging left increases width
      const newWidth = Math.max(160, Math.min(480, ipStartWidth - (e.clientX - ipStartX)));
      infoPanelContainer.style.width = `${newWidth}px`;
    };

    const onInfoPanelMouseUp = () => {
      document.removeEventListener('mousemove', onInfoPanelMouseMove);
      document.removeEventListener('mouseup', onInfoPanelMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    infoPanelResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      ipStartX = e.clientX;
      ipStartWidth = infoPanelContainer.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onInfoPanelMouseMove);
      document.addEventListener('mouseup', onInfoPanelMouseUp);
    });

    layout.main.appendChild(infoPanelResizeHandle);
    layout.main.appendChild(infoPanelContainer);

    // Subscribe to agent events for InfoPanel
    this._ipc.on(IPC_CHANNELS.AGENT_EVENT, (...args: unknown[]) => {
      const event = args[0] as AgentEvent;
      this._infoPanel.handleEvent(event);
    });

    // Feed user attachments into InfoPanel Input section when a message is sent
    this._chatPanel.onDidSendMessage(evt => {
      if (evt.attachments && evt.attachments.length > 0) {
        for (const att of evt.attachments) {
          this._infoPanel.handleEvent({
            type: 'attachment_added',
            attachment: { name: att.name, path: att.path },
            messageId: '',
          });
        }
      }
    });

    // Wire InfoPanel events
    this._infoPanel.onDidRequestScrollToMessage(msgId => this._chatPanel.scrollToMessage(msgId));
    this._infoPanel.onDidRequestRevealFile(filePath => {
      void this._ipc.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, { path: filePath });
    });
    this._infoPanel.onDidTodosReceived(() => this._autoShowInfoPanel());

    // Store reference to main element for settings panel injection
    this._mainEl = layout.main;

    // Wire activity bar to sidebar/settings panel switching
    this._register(this._activityBar.onDidSelectItem(async (item) => {
      if (item === 'settings') {
        this._sidebarWrapperEl.style.display = 'none';
        this._sidebar.getDomNode().style.display = 'none';
        this._chatPanelEl.style.display = 'none';
        this._infoPanelEl.style.display = 'none';

        if (!this._settingsPanel) {
          this._settingsPanel = this._register(new SettingsPanel(this._ipc, this._themeService));
        }
        this._settingsPanel.getDomNode().style.display = '';
        if (!this._mainEl.contains(this._settingsPanel.getDomNode())) {
          this._mainEl.appendChild(this._settingsPanel.getDomNode());
        }
      } else {
        this._sidebarWrapperEl.style.display = '';
        this._sidebar.getDomNode().style.display = '';
        this._chatPanelEl.style.display = '';
        if (this._infoPanelVisible) {
          this._infoPanelEl.style.display = '';
        }
        if (this._settingsPanel) {
          this._settingsPanel.getDomNode().style.display = 'none';
        }

        // Lazy-load files panel on first activation
        if (item === 'files' && !filesLoaded && filesPanel) {
          filesLoaded = true;
          void filesPanel.load();
        }

        this._sidebar.showPanel(item);
      }
    }));

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

    // Status bar wiring
    this._wireStatusBar();
  }

  private _wireStatusBar(): void {
    // Workspace path
    void (async () => {
      try {
        const result = await this._ipc.invoke<{ path: string | null }>(IPC_CHANNELS.WORKSPACE_GET_ROOT, {});
        this._statusBar.updateWorkspace({ path: result?.path ?? null });
      } catch (err) {
        console.warn('[Workbench] Failed to get workspace root for status bar:', err);
        this._statusBar.updateWorkspace({ path: null });
      }
    })();

    // Connectors — maintain local map, seed + subscribe
    const connectorMap = new Map<string, ConnectorStatus>();

    const applyConnectorMap = () => {
      const servers = Array.from(connectorMap.entries()).map(([name, status]) => ({ name, status }));
      this._statusBar.updateConnectors({ servers });
    };

    void (async () => {
      try {
        const result = await this._ipc.invoke<{ servers: Array<{ name: string; status: ConnectorStatus; error?: string }> }>(IPC_CHANNELS.CONNECTOR_LIST);
        for (const s of result?.servers ?? []) {
          connectorMap.set(s.name, s.status);
        }
        applyConnectorMap();
      } catch (err) {
        console.warn('[Workbench] Failed to seed connector list for status bar:', err);
      }
    })();

    this._ipc.on(IPC_CHANNELS.CONNECTOR_STATUS_CHANGED, (...args: unknown[]) => {
      const event = args[0] as { name: string; status: ConnectorStatus; error?: string };
      if (event?.name) {
        connectorMap.set(event.name, event.status);
        applyConnectorMap();
      }
    });

    this._ipc.on(IPC_CHANNELS.CONNECTOR_LIST_CHANGED, () => {
      void (async () => {
        try {
          const result = await this._ipc.invoke<{ servers: Array<{ name: string; status: ConnectorStatus; error?: string }> }>(IPC_CHANNELS.CONNECTOR_LIST);
          connectorMap.clear();
          for (const s of result?.servers ?? []) {
            connectorMap.set(s.name, s.status);
          }
          applyConnectorMap();
        } catch (err) {
          console.warn('[Workbench] Failed to refresh connector list for status bar:', err);
        }
      })();
    });

    // Auth/user — seed + subscribe
    let isAuthenticated = false;
    let lastRemainingPercentage = 100;

    const updateUsageVisibility = (remainingPercentage: number) => {
      this._statusBar.updateUsage({ remainingPercentage, visible: true });
    };

    // Show usage meter immediately with full bar; quota data will update it
    updateUsageVisibility(lastRemainingPercentage);

    void (async () => {
      try {
        const result = await this._ipc.invoke<{ isAuthenticated: boolean; user: { githubLogin: string } | null }>(IPC_CHANNELS.AUTH_STATE);
        isAuthenticated = result?.isAuthenticated ?? false;
        this._statusBar.updateUser({
          githubLogin: result?.user?.githubLogin ?? null,
          isAuthenticated,
        });
        updateUsageVisibility(lastRemainingPercentage);
      } catch (err) {
        console.warn('[Workbench] Failed to seed auth state for status bar:', err);
      }
    })();

    this._ipc.on(IPC_CHANNELS.AUTH_STATE_CHANGED, (...args: unknown[]) => {
      const event = args[0] as { isAuthenticated: boolean; user: { githubLogin: string } | null };
      isAuthenticated = event?.isAuthenticated ?? false;
      this._statusBar.updateUser({
        githubLogin: event?.user?.githubLogin ?? null,
        isAuthenticated,
      });
      updateUsageVisibility(lastRemainingPercentage);
    });

    // Agent state — subscribe
    this._statusBar.updateAgentState({ state: 'idle' });
    this._ipc.on(IPC_CHANNELS.AGENT_STATE_CHANGED, (...args: unknown[]) => {
      const event = args[0] as { state: 'idle' | 'working' | 'error' };
      if (event?.state) {
        this._statusBar.updateAgentState({ state: event.state });
      }
    });

    // Model — seed from ModelSelector, subscribe to live updates
    const seedModel = () => {
      const modelId = this._chatPanel.modelSelector.selectedModel;
      this._statusBar.updateModel({ modelName: modelId });
    };
    // ChatPanel.render() is called before this, so modelSelector exists
    seedModel();
    this._register(this._chatPanel.modelSelector.onDidSelectModel((modelId: string) => {
      this._statusBar.updateModel({ modelName: modelId });
    }));

    // Quota — seed + subscribe
    void (async () => {
      try {
        const result = await this._ipc.invoke<{ snapshots: Array<{ quotaType: string; remainingPercentage: number }> }>(IPC_CHANNELS.QUOTA_GET);
        const snapshots = result?.snapshots ?? [];
        const snap = snapshots.find(s => s.quotaType === 'premium_interactions') ?? snapshots[0];
        if (snap) {
          lastRemainingPercentage = snap.remainingPercentage;
          updateUsageVisibility(lastRemainingPercentage);
        }
      } catch (err) {
        console.warn('[Workbench] Failed to seed quota for status bar:', err);
      }
    })();

    this._ipc.on(IPC_CHANNELS.QUOTA_CHANGED, (...args: unknown[]) => {
      const event = args[0] as { snapshots: Array<{ quotaType: string; remainingPercentage: number }> };
      const snapshots = event?.snapshots ?? [];
      const snap = snapshots.find(s => s.quotaType === 'premium_interactions') ?? snapshots[0];
      if (snap) {
        hasQuota = true;
        lastRemainingPercentage = snap.remainingPercentage;
        updateUsageVisibility(lastRemainingPercentage);
      }
    });

    // Click routing
    this._register(this._statusBar.onDidClickItem((itemId) => {
      if (itemId === 'connectors') {
        // Navigate to settings panel — setActiveItem fires onDidSelectItem
        // which triggers the existing handler that manages panel visibility
        this._activityBar.setActiveItem('settings');
      } else if (itemId === 'user') {
        this._showUserMenu();
      }
    }));
  }

  private async _createNewConversation(): Promise<void> {
    try {
      const response = await this._ipc.invoke<{ id: string; title: string }>(
        IPC_CHANNELS.CONVERSATION_CREATE,
      );
      this._chatPanel.conversationId = response.id;
      await this._chatPanel.loadConversation(response.id);
      this._infoPanel.setConversation(response.id);
      this._userCollapsedInfoPanel = false;
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
    // Cmd+Shift+B for info panel toggle
    this._shortcuts.bind({
      key: 'b',
      meta: true,
      shift: true,
      handler: () => this._toggleInfoPanel(),
    });
  }

  private _toggleSidebar(): void {
    this._sidebarVisible = !this._sidebarVisible;
    this._sidebar.getDomNode().style.display = this._sidebarVisible ? '' : 'none';
  }

  private _toggleInfoPanel(): void {
    if (this._infoPanelVisible) {
      this._hideInfoPanel();
      this._userCollapsedInfoPanel = true;
    } else {
      this._showInfoPanel();
      this._userCollapsedInfoPanel = false;
    }
  }

  private _showInfoPanel(): void {
    this._infoPanelVisible = true;
    this._infoPanelEl.style.display = '';
  }

  private _hideInfoPanel(): void {
    this._infoPanelVisible = false;
    this._infoPanelEl.style.display = 'none';
  }

  private _autoShowInfoPanel(): void {
    if (!this._userCollapsedInfoPanel) {
      this._showInfoPanel();
    }
  }

  private _showUserMenu(): void {
    // Create a simple dropdown menu anchored to the user avatar
    const existing = document.querySelector('.user-menu-dropdown');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'user-menu-dropdown';

    const signOutBtn = document.createElement('button');
    signOutBtn.className = 'user-menu-item';
    signOutBtn.textContent = 'Sign out of GitHub';
    signOutBtn.addEventListener('click', () => {
      menu.remove();
      void this._signOut();
    });
    menu.appendChild(signOutBtn);

    document.body.appendChild(menu);

    // Close on outside click
    const onOutsideClick = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', onOutsideClick, true);
      }
    };
    // Delay to avoid the current click closing it immediately
    requestAnimationFrame(() => {
      document.addEventListener('click', onOutsideClick, true);
    });
  }

  private async _signOut(): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.AUTH_LOGOUT);
      // Reload the app to return to onboarding
      window.location.reload();
    } catch (err) {
      console.error('[Workbench] Failed to sign out:', err);
    }
  }
}
