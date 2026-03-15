import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { InstalledPlugin } from '@gho-work/base';
import { PluginAgentLoader } from './pluginAgentLoader.js';

function makePlugin(overrides: Partial<InstalledPlugin> & { cachePath: string }): InstalledPlugin {
  const { cachePath, ...rest } = overrides;
  return {
    name: 'test-plugin',
    version: '1.0.0',
    enabled: true,
    cachePath,
    installedAt: new Date().toISOString(),
    catalogMeta: {
      name: 'test-plugin',
      description: 'A test plugin',
      location: 'https://example.com/plugin.git',
      hasSkills: false,
      hasMcpServers: false,
      hasCommands: false,
      hasAgents: false,
      hasHooks: false,
    },
    skillCount: 0,
    agentCount: 0,
    mcpServerNames: [],
    commandCount: 0,
    agentIds: [],
    hookCount: 0,
    ...rest,
  };
}

describe('PluginAgentLoader', () => {
  let tmpDir: string;
  let loader: PluginAgentLoader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loader-test-'));
    loader = new PluginAgentLoader();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty for plugin with no agents dir', async () => {
    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(0);
  });

  it('parses agent from frontmatter and body', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'simplifier.md'), `---
name: code-simplifier
displayName: Code Simplifier
description: Simplifies code for clarity
tools: [readFile, editFile]
infer: true
---

You simplify and refine code for clarity.`);

    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);

    expect(result).toHaveLength(1);
    expect(result[0].pluginName).toBe('test-plugin');
    expect(result[0].definition.name).toBe('code-simplifier');
    expect(result[0].definition.displayName).toBe('Code Simplifier');
    expect(result[0].definition.description).toBe('Simplifies code for clarity');
    expect(result[0].definition.tools).toEqual(['readFile', 'editFile']);
    expect(result[0].definition.infer).toBe(true);
    expect(result[0].definition.prompt).toContain('You simplify');
  });

  it('skips agent files missing required fields', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'bad.md'), `---
name: missing-desc
---

Some prompt.`);

    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(0);
  });

  it('skips disabled plugins', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'agent.md'), `---
name: test
description: A test agent
---
prompt`);

    const plugin = makePlugin({ cachePath: tmpDir, enabled: false });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(0);
  });

  it('loads MCP servers from .mcp.json', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'agent.md'), `---
name: mcp-agent
description: Agent with MCP
---
prompt`);
    fs.writeFileSync(path.join(tmpDir, '.mcp.json'), JSON.stringify({
      mcpServers: { myServer: { command: 'node', args: ['server.js'] } },
    }));

    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(1);
    expect(result[0].definition.mcpServers).toEqual({
      myServer: { command: 'node', args: ['server.js'] },
    });
  });

  it('handles tools: null', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'agent.md'), `---
name: all-tools
description: Agent with all tools
tools: null
---
prompt`);

    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(1);
    expect(result[0].definition.tools).toBeNull();
  });

  it('loads multiple agents from one plugin', async () => {
    const agentsDir = path.join(tmpDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'a.md'), `---
name: agent-a
description: First agent
---
prompt a`);
    fs.writeFileSync(path.join(agentsDir, 'b.md'), `---
name: agent-b
description: Second agent
---
prompt b`);

    const plugin = makePlugin({ cachePath: tmpDir });
    const result = await loader.loadAll([plugin]);
    expect(result).toHaveLength(2);
  });
});
