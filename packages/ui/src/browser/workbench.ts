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
import { SettingsPanel } from './settings/settingsPanel.js';
import { ThemeService } from './theme.js';
import { FilesPanel } from './filesPanel.js';

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

    // Store reference to main element for settings panel injection
    this._mainEl = layout.main;

    // Wire activity bar to sidebar/settings panel switching
    this._register(this._activityBar.onDidSelectItem(async (item) => {
      if (item === 'settings') {
        this._sidebarWrapperEl.style.display = 'none';
        this._sidebar.getDomNode().style.display = 'none';
        this._chatPanelEl.style.display = 'none';

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

    // Status bar items
    this._statusBar.addLeftItem('Ready');
    this._statusBar.addRightItem('Copilot SDK');
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
