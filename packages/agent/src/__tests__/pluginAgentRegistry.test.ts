import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginAgentRegistryImpl } from '../node/pluginAgentRegistryImpl.js';
import type { LegacyPluginAgentDefinition } from '@gho-work/base';

describe('PluginAgentRegistryImpl', () => {
  let registry: PluginAgentRegistryImpl;

  const agent: LegacyPluginAgentDefinition = {
    id: 'sentry:seer',
    name: 'seer',
    description: 'Ask questions about your Sentry environment',
    systemPrompt: 'You are a Sentry expert agent...',
    pluginName: 'sentry',
  };

  beforeEach(() => {
    registry = new PluginAgentRegistryImpl();
  });

  it('registers and retrieves an agent', () => {
    registry.register(agent);
    expect(registry.getAgent('sentry:seer')).toEqual(agent);
  });

  it('lists all agents', () => {
    registry.register(agent);
    registry.register({ ...agent, id: 'sentry:sdk-setup', name: 'sdk-setup' });
    expect(registry.getAgents()).toHaveLength(2);
  });

  it('unregisters an agent', () => {
    registry.register(agent);
    registry.unregister('sentry:seer');
    expect(registry.getAgent('sentry:seer')).toBeUndefined();
  });

  it('unregisters all agents for a plugin', () => {
    registry.register(agent);
    registry.register({ ...agent, id: 'sentry:sdk-setup', name: 'sdk-setup' });
    registry.unregisterPlugin('sentry');
    expect(registry.getAgents()).toHaveLength(0);
  });

  it('fires onDidChangeAgents on register', () => {
    const spy = vi.fn();
    registry.onDidChangeAgents(spy);
    registry.register(agent);
    expect(spy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'sentry:seer' })]),
    );
  });
});
