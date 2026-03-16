/**
 * IPC handlers for Plugin and Marketplace domains.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS } from '@gho-work/platform';
import type { MarketplaceSource } from '@gho-work/connectors';
import type { IpcHandlerDeps } from './types.js';

export function registerPluginHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
    skillRegistry,
    pluginService,
    pluginInstaller,
    marketplaceRegistry,
    pluginAgentRegistry,
  } = deps;

  // =========================================================================
  // Plugin handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.PLUGIN_CATALOG, async (...args: unknown[]) => {
    const request = (args[0] ?? {}) as { forceRefresh?: boolean };
    return pluginService.fetchCatalog(request.forceRefresh);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_INSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.install(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_UNINSTALL, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.uninstall(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_ENABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.enable(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_DISABLE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.disable(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_LIST, async () => {
    return pluginService.getInstalled();
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_AGENT_LIST, async () => pluginAgentRegistry.getAgents());

  ipc.handle(IPC_CHANNELS.PLUGIN_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await pluginService.update(name);
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_SKILL_DETAILS, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };

    // Skills from registry (category/name structure)
    const allSkills = skillRegistry.list();
    const prefix = `plugin:${name}`;
    const skills = allSkills
      .filter(s => s.sourceId === prefix || (s.sourceId.startsWith(`${prefix}:`) && !s.sourceId.endsWith(':commands')))
      .map(s => ({ name: s.name, description: s.description }));

    // Commands: read directly from disk since they use flat file layout
    // (the skill registry expects category/name.md structure, so commands aren't indexed there)
    const commands: Array<{ name: string; description: string }> = [];
    const plugin = pluginService.getPlugin(name);
    if (plugin) {
      try {
        // Resolve the actual plugin root (handles git-subdir nesting)
        let pluginRoot = plugin.cachePath;
        const loc = plugin.catalogMeta?.location;
        if (loc && typeof loc !== 'string' && loc.type === 'git-subdir') {
          pluginRoot = path.join(plugin.cachePath, loc.path.replace(/^\.\//, ''));
        }
        const manifest = await pluginInstaller.parseManifest(pluginRoot);
        const cmdDirs: string[] = [];
        if (manifest.commands) {
          const paths = Array.isArray(manifest.commands) ? manifest.commands : [manifest.commands];
          for (const p of paths) {
            cmdDirs.push(path.join(pluginRoot, p));
          }
        } else {
          const defaultDir = path.join(pluginRoot, 'commands');
          if (fs.existsSync(defaultDir)) { cmdDirs.push(defaultDir); }
        }
        for (const dir of cmdDirs) {
          if (!fs.existsSync(dir)) { continue; }
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
          for (const file of files) {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            // Parse frontmatter inline to avoid cross-package import
            let desc = '';
            let fmName = '';
            if (content.startsWith('---')) {
              const endIdx = content.indexOf('---', 3);
              if (endIdx !== -1) {
                const yaml = content.substring(3, endIdx);
                const descMatch = yaml.match(/^description:\s*"?(.+?)"?\s*$/m);
                if (descMatch) { desc = descMatch[1].trim(); }
                const nameMatch = yaml.match(/^name:\s*(.+)$/m);
                if (nameMatch) { fmName = nameMatch[1].trim(); }
              }
            }
            if (desc) {
              commands.push({ name: fmName || file.slice(0, -3), description: desc });
            }
          }
        }
      } catch (err) {
        console.warn(`[plugin-details] Failed to read commands for ${name}:`, err);
      }
    }

    // Agents from the agent registry
    const agents = pluginAgentRegistry.getAgents()
      .filter(a => a.pluginName === name)
      .map(a => ({ name: a.name, description: a.description }));

    // Hooks: read event names from manifest
    const hooks: Array<{ name: string; description: string }> = [];
    if (plugin) {
      try {
        let hooksPluginRoot = plugin.cachePath;
        const hooksLoc = plugin.catalogMeta?.location;
        if (hooksLoc && typeof hooksLoc !== 'string' && hooksLoc.type === 'git-subdir') {
          hooksPluginRoot = path.join(plugin.cachePath, hooksLoc.path.replace(/^\.\//, ''));
        }
        const manifest = await pluginInstaller.parseManifest(hooksPluginRoot);
        const parsed = await pluginInstaller.parseHooks(hooksPluginRoot, manifest.hooks);
        if (parsed) {
          for (const eventName of Object.keys(parsed)) {
            const count = Array.isArray(parsed[eventName]) ? parsed[eventName].length : 0;
            hooks.push({ name: eventName, description: `${count} hook${count !== 1 ? 's' : ''}` });
          }
        }
      } catch (err) {
        console.warn(`[plugin-details] Failed to read hooks for ${name}:`, err);
      }
    }

    return { skills, commands, agents, hooks };
  });

  ipc.handle(IPC_CHANNELS.PLUGIN_VALIDATE, async (...args: unknown[]) => {
    const { path: pluginPath } = args[0] as { path: string };
    return pluginInstaller.validatePlugin(pluginPath);
  });

  // =========================================================================
  // Marketplace handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.MARKETPLACE_LIST, async () => marketplaceRegistry.list());

  ipc.handle(IPC_CHANNELS.MARKETPLACE_ADD, async (...args: unknown[]) => {
    const { source } = args[0] as { source: MarketplaceSource };
    return marketplaceRegistry.add(source);
  });

  ipc.handle(IPC_CHANNELS.MARKETPLACE_REMOVE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    await marketplaceRegistry.remove(name);
  });

  ipc.handle(IPC_CHANNELS.MARKETPLACE_UPDATE, async (...args: unknown[]) => {
    const { name } = args[0] as { name: string };
    return marketplaceRegistry.update(name);
  });
}
