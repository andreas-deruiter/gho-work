// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceItem } from '../../browser/statusBar/workspaceItem.js';
import { ConnectorStatusItem } from '../../browser/statusBar/connectorStatusItem.js';
import { ModelItem } from '../../browser/statusBar/modelItem.js';
import { AgentStateItem } from '../../browser/statusBar/agentStateItem.js';
import { UsageMeterItem } from '../../browser/statusBar/usageMeterItem.js';
import { UserAvatarItem } from '../../browser/statusBar/userAvatarItem.js';

// ---------------------------------------------------------------------------
// WorkspaceItem
// ---------------------------------------------------------------------------

describe('WorkspaceItem', () => {
  let item: WorkspaceItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new WorkspaceItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('renders with initial "Loading…" label', () => {
    const label = item.element.querySelector('.sb-workspace-label');
    expect(label?.textContent).toBe('Loading…');
  });

  it('has correct ARIA attributes', () => {
    expect(item.element.getAttribute('role')).toBe('button');
    expect(item.element.getAttribute('tabindex')).toBe('0');
    expect(item.element.getAttribute('aria-label')).toBe('Workspace');
  });

  it('has sb-workspace class', () => {
    expect(item.element.classList.contains('sb-workspace')).toBe(true);
    expect(item.element.classList.contains('status-bar-item')).toBe(true);
  });

  it('shows "No workspace" for null path', () => {
    item.update({ path: null });
    const label = item.element.querySelector('.sb-workspace-label');
    expect(label?.textContent).toBe('No workspace');
  });

  it('shortens home paths with ~', () => {
    const home = process.env.HOME ?? '/Users/test';
    item.update({ path: `${home}/projects/myapp` });
    const label = item.element.querySelector('.sb-workspace-label');
    expect(label?.textContent).toBe('~/projects/myapp');
  });

  it('shortens non-home paths to last 2 segments with …/', () => {
    item.update({ path: '/opt/work/deep/nested/project' });
    const label = item.element.querySelector('.sb-workspace-label');
    expect(label?.textContent).toBe('…/nested/project');
  });

  it('sets title to full absolute path', () => {
    item.update({ path: '/some/absolute/path' });
    expect(item.element.getAttribute('title')).toBe('/some/absolute/path');
  });

  it('fires onDidClick when clicked', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Enter key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Space key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('contains a folder icon', () => {
    const svg = item.element.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ConnectorStatusItem
// ---------------------------------------------------------------------------

describe('ConnectorStatusItem', () => {
  let item: ConnectorStatusItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new ConnectorStatusItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('renders with initial "…" label', () => {
    const label = item.element.querySelector('.sb-connectors-label');
    expect(label?.textContent).toBe('…');
  });

  it('has correct ARIA attributes', () => {
    expect(item.element.getAttribute('role')).toBe('button');
    expect(item.element.getAttribute('tabindex')).toBe('0');
    expect(item.element.getAttribute('aria-label')).toBe('Connectors');
  });

  it('is hidden when 0 servers', () => {
    item.update({ servers: [] });
    expect(item.element.style.display).toBe('none');
  });

  it('shows "1 connector" for singular', () => {
    item.update({ servers: [{ name: 'GitHub', status: 'connected' }] });
    const label = item.element.querySelector('.sb-connectors-label');
    expect(label?.textContent).toBe('1 connector');
    expect(item.element.style.display).not.toBe('none');
  });

  it('shows "N connectors" for plural', () => {
    item.update({
      servers: [
        { name: 'GitHub', status: 'connected' },
        { name: 'Jira', status: 'connected' },
      ],
    });
    const label = item.element.querySelector('.sb-connectors-label');
    expect(label?.textContent).toBe('2 connectors');
  });

  it('shows green dot when all connected', () => {
    item.update({ servers: [{ name: 'GitHub', status: 'connected' }] });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('green')).toBe(true);
  });

  it('shows red dot when all disconnected/error', () => {
    item.update({
      servers: [
        { name: 'GitHub', status: 'disconnected' },
        { name: 'Jira', status: 'error' },
      ],
    });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('red')).toBe(true);
  });

  it('shows yellow dot when mixed', () => {
    item.update({
      servers: [
        { name: 'GitHub', status: 'connected' },
        { name: 'Jira', status: 'error' },
      ],
    });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('yellow')).toBe(true);
  });

  it('fires onDidClick when clicked', () => {
    item.update({ servers: [{ name: 'GitHub', status: 'connected' }] });
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Enter key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// ModelItem
// ---------------------------------------------------------------------------

describe('ModelItem', () => {
  let item: ModelItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new ModelItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('renders with initial "Loading…" text', () => {
    expect(item.element.textContent).toContain('Loading…');
  });

  it('has correct ARIA attributes', () => {
    expect(item.element.getAttribute('role')).toBe('button');
    expect(item.element.getAttribute('tabindex')).toBe('0');
    expect(item.element.getAttribute('aria-label')).toBe('Active model');
  });

  it('has sb-model class', () => {
    expect(item.element.classList.contains('sb-model')).toBe(true);
    expect(item.element.classList.contains('status-bar-item')).toBe(true);
  });

  it('shows model name after update', () => {
    item.update({ modelName: 'gpt-4o' });
    expect(item.element.textContent).toContain('gpt-4o');
  });

  it('fires onDidClick when clicked', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Space key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AgentStateItem
// ---------------------------------------------------------------------------

describe('AgentStateItem', () => {
  let item: AgentStateItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new AgentStateItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('has sb-agent-state class', () => {
    expect(item.element.classList.contains('sb-agent-state')).toBe(true);
    expect(item.element.classList.contains('status-bar-item')).toBe(true);
  });

  it('has aria-live="polite"', () => {
    expect(item.element.getAttribute('aria-live')).toBe('polite');
  });

  it('defaults to idle state with green dot', () => {
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('green')).toBe(true);
    const label = item.element.querySelector('.sb-agent-label');
    expect(label?.textContent).toBe('Agent idle');
  });

  it('shows yellow pulsing dot when working', () => {
    item.update({ state: 'working' });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('yellow')).toBe(true);
    expect(dot?.classList.contains('pulse')).toBe(true);
    const label = item.element.querySelector('.sb-agent-label');
    expect(label?.textContent).toBe('Agent working');
  });

  it('shows red dot and error label on error', () => {
    item.update({ state: 'error' });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('red')).toBe(true);
    expect(dot?.classList.contains('pulse')).toBe(false);
    const label = item.element.querySelector('.sb-agent-label');
    expect(label?.textContent).toBe('Agent error');
  });

  it('returns to idle correctly', () => {
    item.update({ state: 'working' });
    item.update({ state: 'idle' });
    const dot = item.element.querySelector('.sb-dot');
    expect(dot?.classList.contains('green')).toBe(true);
    expect(dot?.classList.contains('pulse')).toBe(false);
  });

  it('is not clickable (no role=button)', () => {
    expect(item.element.getAttribute('role')).not.toBe('button');
  });
});

// ---------------------------------------------------------------------------
// UsageMeterItem
// ---------------------------------------------------------------------------

describe('UsageMeterItem', () => {
  let item: UsageMeterItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new UsageMeterItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('is hidden initially', () => {
    expect(item.element.style.display).toBe('none');
  });

  it('has correct ARIA attributes on container', () => {
    expect(item.element.getAttribute('role')).toBe('button');
    expect(item.element.getAttribute('tabindex')).toBe('0');
  });

  it('shows when visible=true', () => {
    item.update({ remainingPercentage: 0.8, visible: true });
    expect(item.element.style.display).not.toBe('none');
  });

  it('hides again when visible=false', () => {
    item.update({ remainingPercentage: 0.8, visible: true });
    item.update({ remainingPercentage: 0.8, visible: false });
    expect(item.element.style.display).toBe('none');
  });

  it('shows remaining percentage label', () => {
    item.update({ remainingPercentage: 0.75, visible: true });
    const label = item.element.querySelector('.sb-usage-label');
    expect(label?.textContent).toBe('75%');
  });

  it('rounds percentage to integer', () => {
    item.update({ remainingPercentage: 0.333, visible: true });
    const label = item.element.querySelector('.sb-usage-label');
    expect(label?.textContent).toBe('33%');
  });

  it('sets fill width to used percentage (100 - remaining)', () => {
    item.update({ remainingPercentage: 0.7, visible: true });
    const fill = item.element.querySelector('.sb-usage-fill') as HTMLElement;
    expect(fill?.style.width).toBe('30%');
  });

  it('sets aria-valuenow on meter bar', () => {
    item.update({ remainingPercentage: 0.6, visible: true });
    const bar = item.element.querySelector('[role="meter"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('60');
  });

  it('bar has aria-valuemin="0" and aria-valuemax="100"', () => {
    const bar = item.element.querySelector('[role="meter"]');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar?.getAttribute('aria-label')).toBe('Copilot usage');
  });

  it('adds usage-warning class at ≤20%', () => {
    item.update({ remainingPercentage: 0.2, visible: true });
    expect(item.element.classList.contains('usage-warning')).toBe(true);
    expect(item.element.classList.contains('usage-critical')).toBe(false);
  });

  it('adds usage-critical class at 0%', () => {
    item.update({ remainingPercentage: 0, visible: true });
    expect(item.element.classList.contains('usage-critical')).toBe(true);
  });

  it('no warning/critical classes above 20%', () => {
    item.update({ remainingPercentage: 0.21, visible: true });
    expect(item.element.classList.contains('usage-warning')).toBe(false);
    expect(item.element.classList.contains('usage-critical')).toBe(false);
  });

  it('removes warning class when usage improves', () => {
    item.update({ remainingPercentage: 0.1, visible: true });
    item.update({ remainingPercentage: 0.9, visible: true });
    expect(item.element.classList.contains('usage-warning')).toBe(false);
    expect(item.element.classList.contains('usage-critical')).toBe(false);
  });

  it('fires onDidClick when clicked', () => {
    item.update({ remainingPercentage: 0.5, visible: true });
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// UserAvatarItem
// ---------------------------------------------------------------------------

describe('UserAvatarItem', () => {
  let item: UserAvatarItem;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    item = new UserAvatarItem();
    container.appendChild(item.element);
  });

  afterEach(() => {
    item.dispose();
    container.remove();
  });

  it('has sb-user class', () => {
    expect(item.element.classList.contains('sb-user')).toBe(true);
    expect(item.element.classList.contains('status-bar-item')).toBe(true);
  });

  it('has correct ARIA attributes', () => {
    expect(item.element.getAttribute('role')).toBe('button');
    expect(item.element.getAttribute('tabindex')).toBe('0');
    expect(item.element.getAttribute('aria-label')).toBe('User');
  });

  it('shows SVG icon when not authenticated', () => {
    item.update({ githubLogin: null, isAuthenticated: false });
    const svg = item.element.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(item.element.classList.contains('sb-user-avatar')).toBe(false);
  });

  it('shows first letter (uppercase) when authenticated', () => {
    item.update({ githubLogin: 'andreasderuiter', isAuthenticated: true });
    expect(item.element.textContent).toBe('A');
    expect(item.element.classList.contains('sb-user-avatar')).toBe(true);
  });

  it('handles uppercase login correctly', () => {
    item.update({ githubLogin: 'Bob', isAuthenticated: true });
    expect(item.element.textContent).toBe('B');
  });

  it('switches back to SVG when logged out', () => {
    item.update({ githubLogin: 'alice', isAuthenticated: true });
    item.update({ githubLogin: null, isAuthenticated: false });
    const svg = item.element.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(item.element.classList.contains('sb-user-avatar')).toBe(false);
  });

  it('fires onDidClick when clicked', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Enter key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires onDidClick on Space key', () => {
    const listener = vi.fn();
    item.onDidClick(listener);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
