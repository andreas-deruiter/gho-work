/**
 * Main workbench — VS Code-style DOM-based UI shell.
 * Sets up the top-level layout and panels.
 */
import { DisposableStore } from '@gho-work/base';
import type { IIPCRenderer } from '@gho-work/platform';
import { ChatPanel } from './chat-panel.js';

export class Workbench {
  private disposables = new DisposableStore();
  private chatPanel: ChatPanel;

  constructor(
    private container: HTMLElement,
    private ipc: IIPCRenderer,
  ) {
    this.chatPanel = new ChatPanel(ipc);
  }

  render(): void {
    // Clear container
    this.container.innerHTML = '';

    // Title bar
    const titleBar = document.createElement('header');
    titleBar.className = 'title-bar';
    titleBar.innerHTML = `
      <div class="title-bar-content">
        <span class="title-bar-logo">GHO Work</span>
        <span class="title-bar-status">Spike / Proof of Concept</span>
      </div>
    `;
    this.container.appendChild(titleBar);

    // Main content area
    const main = document.createElement('main');
    main.className = 'workbench-main';
    this.container.appendChild(main);

    // Sidebar (minimal)
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = `
      <nav class="sidebar-nav">
        <button class="sidebar-btn active" data-panel="chat" title="Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button class="sidebar-btn" data-panel="connectors" title="Connectors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
          </svg>
        </button>
        <button class="sidebar-btn" data-panel="settings" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </nav>
    `;
    main.appendChild(sidebar);

    // Content area
    const content = document.createElement('div');
    content.className = 'workbench-content';
    main.appendChild(content);

    // Render chat panel
    this.chatPanel.render(content);
  }

  dispose(): void {
    this.chatPanel.dispose();
    this.disposables.dispose();
  }
}
