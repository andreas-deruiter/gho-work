import { describe, it, expect } from 'vitest';
import { InfoPanelState, isInputTool, isOutputTool, formatFileSize, extractInputName } from './infoPanelState.js';

describe('isInputTool', () => {
  it('classifies readFile as input', () => { expect(isInputTool('readFile', '')).toBe(true); });
  it('classifies read_file as input', () => { expect(isInputTool('read_file', '')).toBe(true); });
  it('classifies searchFiles as input', () => { expect(isInputTool('searchFiles', '')).toBe(true); });
  it('classifies listDirectory as input', () => { expect(isInputTool('listDirectory', '')).toBe(true); });
  it('classifies any MCP tool (serverName set) as input', () => { expect(isInputTool('getCellRange', 'google-sheets')).toBe(true); });
  it('does not classify writeFile as input', () => { expect(isInputTool('writeFile', '')).toBe(false); });
});

describe('isOutputTool', () => {
  it('classifies writeFile as output', () => { expect(isOutputTool('writeFile')).toBe(true); });
  it('classifies write_file as output', () => { expect(isOutputTool('write_file')).toBe(true); });
  it('classifies createFile as output', () => { expect(isOutputTool('createFile')).toBe(true); });
  it('classifies editFile as output', () => { expect(isOutputTool('editFile')).toBe(true); });
  it('does not classify readFile as output', () => { expect(isOutputTool('readFile')).toBe(false); });
});

describe('formatFileSize', () => {
  it('formats bytes', () => { expect(formatFileSize(500)).toBe('500 B'); });
  it('formats kilobytes', () => { expect(formatFileSize(24576)).toBe('24 KB'); });
  it('formats megabytes', () => { expect(formatFileSize(2621440)).toBe('2.5 MB'); });
});

describe('extractInputName', () => {
  it('extracts filename from path argument', () => { expect(extractInputName('readFile', '', { path: '/data/input.csv' })).toBe('input.csv'); });
  it('extracts filename from filePath argument', () => { expect(extractInputName('readFile', '', { filePath: '/data/input.csv' })).toBe('input.csv'); });
  it('extracts filename from file argument', () => { expect(extractInputName('readFile', '', { file: '/data/input.csv' })).toBe('input.csv'); });
  it('formats MCP tool as server / toolName', () => { expect(extractInputName('getCellRange', 'google-sheets', {})).toBe('google-sheets / getCellRange'); });
  it('falls back to toolName if no recognized path argument', () => { expect(extractInputName('readFile', '', { uri: 'https://example.com' })).toBe('readFile'); });
});

describe('InfoPanelState', () => {
  it('starts empty', () => {
    const state = new InfoPanelState();
    expect(state.todos).toEqual([]);
    expect(state.inputs).toEqual([]);
    expect(state.outputs).toEqual([]);
  });

  it('adds input entries and deduplicates by path', () => {
    const state = new InfoPanelState();
    state.addInput({ name: 'file.csv', path: '/tmp/file.csv', messageId: 'msg-1', kind: 'file' });
    state.addInput({ name: 'file.csv', path: '/tmp/file.csv', messageId: 'msg-3', kind: 'file' });
    expect(state.inputs).toHaveLength(1);
    expect(state.inputs[0].count).toBe(2);
  });

  it('adds output entries', () => {
    const state = new InfoPanelState();
    state.addOutput({ name: 'out.xlsx', path: '/tmp/out.xlsx', size: 24576, action: 'created', messageId: 'msg-2' });
    expect(state.outputs).toHaveLength(1);
    expect(state.outputs[0].action).toBe('created');
  });

  it('tracks toolCallId to toolName mapping', () => {
    const state = new InfoPanelState();
    state.trackToolCall('tc-1', 'readFile', '');
    state.trackToolCall('tc-2', 'getCellRange', 'google-sheets');
    expect(state.getToolInfo('tc-1')).toEqual({ toolName: 'readFile', serverName: '' });
    expect(state.getToolInfo('tc-2')).toEqual({ toolName: 'getCellRange', serverName: 'google-sheets' });
    expect(state.getToolInfo('tc-unknown')).toBeUndefined();
  });

});

describe('InfoPanelState todos', () => {
  it('stores and retrieves todos', () => {
    const state = new InfoPanelState();
    const todos = [
      { id: 1, title: 'Step one', status: 'not-started' as const },
      { id: 2, title: 'Step two', status: 'not-started' as const },
    ];
    state.setTodos(todos);
    expect(state.todos).toHaveLength(2);
    expect(state.todos[0].title).toBe('Step one');
  });

  it('replaces todos on subsequent calls', () => {
    const state = new InfoPanelState();
    state.setTodos([{ id: 1, title: 'Old', status: 'not-started' }]);
    state.setTodos([{ id: 1, title: 'New', status: 'completed' }]);
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].title).toBe('New');
    expect(state.todos[0].status).toBe('completed');
  });

  it('clears todos on clear()', () => {
    const state = new InfoPanelState();
    state.setTodos([{ id: 1, title: 'A', status: 'not-started' }]);
    state.clear();
    expect(state.todos).toHaveLength(0);
  });

  it('preserves context sources across clear()', () => {
    const state = new InfoPanelState();
    state.setContextSources([{ path: '/a', origin: 'user', format: 'gho' }]);
    state.clear();
    expect(state.contextSources).toHaveLength(1);
  });
});

describe('InfoPanelState — agents', () => {
  it('stores and retrieves agent entries', () => {
    const state = new InfoPanelState();
    state.setAgents([{ id: 'tc-1', name: 'reviewer', displayName: 'Code Reviewer', state: 'running' }]);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0].state).toBe('running');
  });

  it('clears agents on clear()', () => {
    const state = new InfoPanelState();
    state.setAgents([{ id: 'tc-1', name: 'reviewer', displayName: 'Code Reviewer', state: 'running' }]);
    state.clear();
    expect(state.agents).toHaveLength(0);
  });
});

describe('InfoPanelState — skills', () => {
  it('stores and retrieves skill entries', () => {
    const state = new InfoPanelState();
    state.setSkills([{ name: 'brainstorming', state: 'running' }]);
    expect(state.skills).toHaveLength(1);
  });

  it('clears skills on clear()', () => {
    const state = new InfoPanelState();
    state.setSkills([{ name: 'brainstorming', state: 'running' }]);
    state.clear();
    expect(state.skills).toHaveLength(0);
  });
});

describe('InfoPanelState — usage', () => {
  it('stores usage data', () => {
    const state = new InfoPanelState();
    state.setUsageData({ used: 500, total: 1000, remainingPercentage: 50 });
    expect(state.usageData?.used).toBe(500);
  });

  it('preserves usage data on clear()', () => {
    const state = new InfoPanelState();
    state.setUsageData({ used: 500, total: 1000, remainingPercentage: 50 });
    state.clear();
    expect(state.usageData).not.toBeNull();
  });
});

describe('InfoPanelState — collapse state', () => {
  it('tracks collapse per section', () => {
    const state = new InfoPanelState();
    state.setCollapsed('progress', true);
    state.setCollapsed('agents', false);
    expect(state.isCollapsed('progress')).toBe(true);
    expect(state.isCollapsed('agents')).toBe(false);
  });

  it('preserves collapse state on clear()', () => {
    const state = new InfoPanelState();
    state.setCollapsed('progress', true);
    state.clear();
    expect(state.isCollapsed('progress')).toBe(true);
  });

  it('returns undefined for unset sections', () => {
    const state = new InfoPanelState();
    expect(state.isCollapsed('unknown')).toBeUndefined();
  });
});
