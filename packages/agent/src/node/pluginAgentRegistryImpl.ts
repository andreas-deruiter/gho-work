import { Disposable, Emitter, type Event, type LegacyPluginAgentDefinition } from '@gho-work/base';
import type { IPluginAgentRegistry } from '../common/pluginAgentRegistry.js';

export class PluginAgentRegistryImpl extends Disposable implements IPluginAgentRegistry {
  private readonly _agents = new Map<string, LegacyPluginAgentDefinition>();
  private readonly _onDidChangeAgents = this._register(new Emitter<LegacyPluginAgentDefinition[]>());
  readonly onDidChangeAgents: Event<LegacyPluginAgentDefinition[]> = this._onDidChangeAgents.event;

  register(agent: LegacyPluginAgentDefinition): void {
    this._agents.set(agent.id, agent);
    this._onDidChangeAgents.fire(this.getAgents());
  }

  unregister(agentId: string): void {
    this._agents.delete(agentId);
    this._onDidChangeAgents.fire(this.getAgents());
  }

  unregisterPlugin(pluginName: string): void {
    for (const [id, agent] of this._agents) {
      if (agent.pluginName === pluginName) {
        this._agents.delete(id);
      }
    }
    this._onDidChangeAgents.fire(this.getAgents());
  }

  getAgents(): LegacyPluginAgentDefinition[] {
    return [...this._agents.values()];
  }

  getAgent(id: string): LegacyPluginAgentDefinition | undefined {
    return this._agents.get(id);
  }
}
