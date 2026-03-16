/**
 * IPC handlers for Connector and Skill domains.
 */
import * as fs from 'node:fs';
import { IPC_CHANNELS, SkillToggleRequestSchema } from '@gho-work/platform';
import type {
  ConnectorRemoveRequest,
  ConnectorConnectRequest,
  ConnectorDisconnectRequest,
} from '@gho-work/platform';
import type { MCPServerConfig } from '@gho-work/base';
import { listSkillsWithDisabledState } from './authHandlers.js';
import type { IpcHandlerDeps } from './types.js';

export function registerConnectorHandlers(deps: IpcHandlerDeps): void {
  const {
    ipc,
    agentService,
    skillRegistry,
    skillSources,
    storageService,
    mcpClientManager,
    configStore,
  } = deps;

  // =========================================================================
  // Connector handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.CONNECTOR_LIST, async () => {
    const servers = configStore.getServers();
    return Array.from(servers.entries()).map(([name, config]) => {
      const status = mcpClientManager.getServerStatus(name);
      return {
        name,
        type: config.type,
        connected: status === 'connected',
        error: status === 'error' ? 'Connection failed' : undefined,
        source: config.source,
      };
    });
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_REMOVE, async (...args: unknown[]) => {
    const request = args[0] as ConnectorRemoveRequest;
    try {
      // Reconciliation triggered via onDidChangeServers will auto-disconnect
      await configStore.removeServer(request.name);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_REMOVE failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_CONNECT, async (...args: unknown[]) => {
    const request = args[0] as ConnectorConnectRequest;
    const config = configStore.getServer(request.name);
    if (!config) {
      return { success: false, error: `Server not found: ${request.name}` };
    }
    try {
      await mcpClientManager.connectServer(request.name, config);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_CONNECT failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_DISCONNECT, async (...args: unknown[]) => {
    const request = args[0] as ConnectorDisconnectRequest;
    try {
      await mcpClientManager.disconnectServer(request.name);
      return { success: true };
    } catch (err) {
      console.error('[mainProcess] CONNECTOR_DISCONNECT failed:', err instanceof Error ? err.message : String(err));
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_SETUP_CONVERSATION, async () => {
    try {
      const conversationId = await agentService.createSetupConversation();
      return { conversationId };
    } catch (err) {
      console.error('[mainProcess] Setup conversation failed:', err);
      return { conversationId: '', error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_ADD, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.addServer(name, config);
  });

  ipc.handle(IPC_CHANNELS.CONNECTOR_UPDATE, async (...args: unknown[]) => {
    const { name, config } = args[0] as { name: string; config: MCPServerConfig };
    await configStore.updateServer(name, config);
  });

  // =========================================================================
  // Skill handlers
  // =========================================================================

  ipc.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    return listSkillsWithDisabledState(skillRegistry, storageService);
  });

  ipc.handle(IPC_CHANNELS.SKILL_SOURCES, async () => {
    return skillRegistry.getSources();
  });

  ipc.handle(IPC_CHANNELS.SKILL_ADD_PATH, async (...args: unknown[]) => {
    const { path: newPath } = args[0] as { path: string };

    // Validate path exists
    if (!fs.existsSync(newPath)) {
      return { error: 'Directory not found' };
    }

    // Check for duplicates
    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    if (paths.includes(newPath) || skillSources.some((s) => s.basePath === newPath)) {
      return { error: 'Path already added' };
    }

    paths.push(newPath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(paths));

    skillSources.push({ id: `additional-${paths.length}`, priority: 20, basePath: newPath });
    await skillRegistry.refresh();

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
    return { ok: true as const };
  });

  ipc.handle(IPC_CHANNELS.SKILL_REMOVE_PATH, async (...args: unknown[]) => {
    const { path: removePath } = args[0] as { path: string };

    const existing = storageService?.getSetting('skills.additionalPaths');
    const paths: string[] = existing ? JSON.parse(existing) : [];
    const filtered = paths.filter((p) => p !== removePath);
    storageService?.setSetting('skills.additionalPaths', JSON.stringify(filtered));

    const idx = skillSources.findIndex((s) => s.basePath === removePath && s.priority > 0);
    if (idx >= 0) {
      skillSources.splice(idx, 1);
    }
    await skillRegistry.refresh();

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
  });

  ipc.handle(IPC_CHANNELS.SKILL_RESCAN, async () => {
    await skillRegistry.refresh();
    return listSkillsWithDisabledState(skillRegistry, storageService);
  });

  ipc.handle(IPC_CHANNELS.SKILL_TOGGLE, async (...args: unknown[]) => {
    const { skillId, enabled } = SkillToggleRequestSchema.parse(args[0]);
    const raw = storageService?.getSetting('skills.disabled');
    const disabled: string[] = raw ? JSON.parse(raw) : [];

    if (enabled) {
      const filtered = disabled.filter(id => id !== skillId);
      storageService?.setSetting('skills.disabled', JSON.stringify(filtered));
    } else {
      if (!disabled.includes(skillId)) {
        disabled.push(skillId);
        storageService?.setSetting('skills.disabled', JSON.stringify(disabled));
      }
    }

    ipc.sendToRenderer(IPC_CHANNELS.SKILL_CHANGED, listSkillsWithDisabledState(skillRegistry, storageService));
    return { ok: true as const };
  });

  ipc.handle(IPC_CHANNELS.SKILL_DISABLED_LIST, async () => {
    const raw = storageService?.getSetting('skills.disabled');
    return raw ? JSON.parse(raw) : [];
  });

  ipc.handle(IPC_CHANNELS.SKILL_OPEN_FILE, async (_evt: unknown, args: unknown) => {
    const { filePath: fp } = args as { filePath: string };
    const { shell: electronShell } = await import('electron');
    await electronShell.openPath(fp);
  });
}
