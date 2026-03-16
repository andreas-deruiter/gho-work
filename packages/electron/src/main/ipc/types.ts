/**
 * Shared types for IPC handler domain files.
 */
import type { IIPCMain } from '@gho-work/platform';
import type { SqliteStorageService, NodeFileService } from '@gho-work/platform';
import type { IAuthService } from '@gho-work/platform';
import type { ConversationServiceImpl } from '@gho-work/agent';
import type {
  CopilotSDKImpl,
  AgentServiceImpl,
  SkillRegistryImpl,
  PluginAgentRegistryImpl,
  InstructionResolver,
  SkillSource,
} from '@gho-work/agent';
import type {
  IMCPClientManager,
  IConnectorConfigStore,
  PluginServiceImpl,
  MarketplaceRegistryImpl,
  PluginInstaller,
} from '@gho-work/connectors';

// ---------------------------------------------------------------------------
// Deps interface — everything the IPC handlers need from the outside
// ---------------------------------------------------------------------------

export interface IpcHandlerDeps {
  ipc: IIPCMain;
  conversationService: ConversationServiceImpl | null;
  sdk: CopilotSDKImpl;
  agentService: AgentServiceImpl;
  sdkReady: Promise<void>;
  skillRegistry: SkillRegistryImpl;
  skillSources: SkillSource[];
  storageService: SqliteStorageService | undefined;
  mcpClientManager: IMCPClientManager;
  configStore: IConnectorConfigStore;
  pluginService: PluginServiceImpl;
  pluginInstaller: PluginInstaller;
  marketplaceRegistry: MarketplaceRegistryImpl;
  authService: IAuthService;
  fileService: NodeFileService;
  pluginAgentRegistry: PluginAgentRegistryImpl;
  instructionResolver: InstructionResolver;
  onboardingFilePath: string;
  workspaceId: string | undefined;
  useMock: boolean;
}
