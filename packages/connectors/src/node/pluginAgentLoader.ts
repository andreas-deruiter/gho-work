/**
 * PluginAgentLoader — reads agent .md files from installed plugins
 * and converts them to PluginAgentDefinition[].
 *
 * Frontmatter is parsed using regex (same approach as skillRegistryImpl.ts).
 * Body content (after frontmatter) becomes the agent prompt.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { InstalledPlugin, PluginAgentDefinition } from '@gho-work/base';

export interface LoadedAgent {
  pluginName: string;
  definition: PluginAgentDefinition;
}

/**
 * Parses YAML-like frontmatter from a markdown file.
 * Returns key-value pairs from the frontmatter block and the body after it.
 */
function parseFrontmatter(content: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {};

  if (!content.startsWith('---')) {
    return { fields, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { fields, body: content };
  }

  const yaml = content.substring(3, endIndex);
  const body = content.substring(endIndex + 3).trim();

  // Parse simple key: value lines
  for (const line of yaml.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      fields[match[1]] = match[2].trim();
    }
  }

  return { fields, body };
}

/**
 * Parses a tools field value like "[readFile, editFile, searchFiles]" into a string array.
 * Returns null if the value is "null" or empty.
 */
function parseToolsList(value: string | undefined): string[] | null {
  if (!value || value === 'null') {
    return null;
  }
  // Strip brackets and split by comma
  const inner = value.replace(/^\[/, '').replace(/]$/, '');
  if (!inner.trim()) {
    return null;
  }
  return inner.split(',').map(s => s.trim()).filter(Boolean);
}

export class PluginAgentLoader {
  async loadAll(plugins: InstalledPlugin[]): Promise<LoadedAgent[]> {
    const results: LoadedAgent[] = [];
    for (const plugin of plugins) {
      if (!plugin.enabled) {
        continue;
      }
      const agents = await this.loadFromPlugin(plugin);
      results.push(...agents);
    }
    return results;
  }

  async loadFromPlugin(plugin: InstalledPlugin): Promise<LoadedAgent[]> {
    const agentsDir = path.join(plugin.cachePath, 'agents');
    const results: LoadedAgent[] = [];

    let entries: string[];
    try {
      entries = await fs.readdir(agentsDir);
    } catch {
      // No agents directory — that's fine
      return results;
    }

    // Read MCP servers if available
    let mcpServers: Record<string, unknown> | undefined;
    try {
      const mcpPath = path.join(plugin.cachePath, '.mcp.json');
      const mcpRaw = await fs.readFile(mcpPath, { encoding: 'utf-8' });
      const parsed = JSON.parse(mcpRaw) as { mcpServers?: Record<string, unknown> };
      if (parsed.mcpServers && Object.keys(parsed.mcpServers).length > 0) {
        mcpServers = parsed.mcpServers;
      }
    } catch {
      // No .mcp.json — that's fine
    }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.md')) {
        continue;
      }

      const filePath = path.join(agentsDir, entry);
      try {
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        const { fields, body } = parseFrontmatter(content);

        if (!fields.name || !fields.description) {
          console.warn(`[PluginAgentLoader] Skipping ${filePath}: missing required 'name' or 'description' in frontmatter`);
          continue;
        }

        const definition: PluginAgentDefinition = {
          name: fields.name,
          displayName: fields.displayName || fields.name,
          description: fields.description,
          prompt: body,
          tools: parseToolsList(fields.tools),
          infer: fields.infer !== undefined ? fields.infer !== 'false' : true,
          ...(mcpServers ? { mcpServers } : {}),
        };

        results.push({ pluginName: plugin.name, definition });
      } catch (err) {
        console.warn(`[PluginAgentLoader] Failed to read agent file ${filePath}:`, err instanceof Error ? err.message : String(err));
      }
    }

    return results;
  }
}
