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
    expect(state.plan).toBeNull();
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

  it('sets plan and updates step states', () => {
    const state = new InfoPanelState();
    state.setPlan({ id: 'p1', steps: [{ id: 's1', label: 'Fetch' }, { id: 's2', label: 'Analyze' }] });
    expect(state.plan!.steps).toHaveLength(2);
    expect(state.plan!.steps[0].state).toBe('pending');
    state.updateStep('s1', 'active', { startedAt: 1000 });
    expect(state.plan!.steps[0].state).toBe('active');
    state.updateStep('s1', 'completed', { completedAt: 2000, messageId: 'msg-5' });
    expect(state.plan!.steps[0].state).toBe('completed');
    expect(state.plan!.steps[0].messageId).toBe('msg-5');
  });
});
