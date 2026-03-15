import type { Event, PluginAgentDefinition } from '@gho-work/base';

export interface IPluginAgentRegistry {
  register(agent: PluginAgentDefinition): void;
  unregister(agentId: string): void;
  unregisterPlugin(pluginName: string): void;
  getAgents(): PluginAgentDefinition[];
  getAgent(id: string): PluginAgentDefinition | undefined;
  readonly onDidChangeAgents: Event<PluginAgentDefinition[]>;
}
