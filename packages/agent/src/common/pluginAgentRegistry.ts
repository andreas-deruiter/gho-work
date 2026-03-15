import type { Event, LegacyPluginAgentDefinition } from '@gho-work/base';

export interface IPluginAgentRegistry {
  register(agent: LegacyPluginAgentDefinition): void;
  unregister(agentId: string): void;
  unregisterPlugin(pluginName: string): void;
  getAgents(): LegacyPluginAgentDefinition[];
  getAgent(id: string): LegacyPluginAgentDefinition | undefined;
  readonly onDidChangeAgents: Event<LegacyPluginAgentDefinition[]>;
}
