/**
 * Main workbench — VS Code-style DOM-based UI shell.
 * Sets up the top-level layout and panels using Widget pattern.
 */
import { Disposable } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform/common';
import { h } from './dom.js';
import { ActivityBar } from './activityBar.js';
import { StatusBar } from './statusBar.js';
import { KeyboardShortcuts } from './keyboardShortcuts.js';
import { ChatPanel } from './chatPanel.js';

export class Workbench extends Disposable {
  private readonly _activityBar: ActivityBar;
  private readonly _statusBar: StatusBar;
  private readonly _shortcuts: KeyboardShortcuts;
  private _sidebarVisible = true;
  private _sidebarEl!: HTMLElement;

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

    // Chat panel in main content
    const chatPanel = this._register(new ChatPanel(this._ipc));
    chatPanel.render(layout.main);

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
    this._statusBar.addRightItem('Mock Agent');
  }

  private _setupShortcuts(): void {
    this._shortcuts.bind({
      key: 'b',
      meta: true,
      handler: () => this._toggleSidebar(),
    });
  }

  private _toggleSidebar(): void {
    this._sidebarVisible = !this._sidebarVisible;
    if (this._sidebarEl) {
      this._sidebarEl.style.display = this._sidebarVisible ? '' : 'none';
    }
  }
}
