import { Disposable, Emitter, type Event, type PluginAgentDefinition } from '@gho-work/base';
import type { IPluginAgentRegistry } from '../common/pluginAgentRegistry.js';

export class PluginAgentRegistryImpl extends Disposable implements IPluginAgentRegistry {
  private readonly _agents = new Map<string, PluginAgentDefinition>();
  private readonly _onDidChangeAgents = this._register(new Emitter<PluginAgentDefinition[]>());
  readonly onDidChangeAgents: Event<PluginAgentDefinition[]> = this._onDidChangeAgents.event;

  register(agent: PluginAgentDefinition): void {
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

  getAgents(): PluginAgentDefinition[] {
    return [...this._agents.values()];
  }

  getAgent(id: string): PluginAgentDefinition | undefined {
    return this._agents.get(id);
  }
}
