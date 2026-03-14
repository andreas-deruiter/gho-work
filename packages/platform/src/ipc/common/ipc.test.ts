import { describe, it, expect } from 'vitest';
import { AgentStateChangedSchema, QuotaSnapshotSchema, QuotaResultSchema } from './ipc.js';

describe('AgentStateChangedSchema', () => {
  it('should validate idle state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'idle' })).toEqual({ state: 'idle' });
  });
  it('should validate working state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'working' })).toEqual({ state: 'working' });
  });
  it('should validate error state', () => {
    expect(AgentStateChangedSchema.parse({ state: 'error' })).toEqual({ state: 'error' });
  });
  it('should reject invalid state', () => {
    expect(() => AgentStateChangedSchema.parse({ state: 'unknown' })).toThrow();
  });
});

describe('QuotaResultSchema', () => {
  it('should validate a quota result', () => {
    const data = {
      snapshots: [{
        quotaType: 'premium_interactions',
        entitlementRequests: 300,
        usedRequests: 158,
        remainingPercentage: 0.47,
        overage: 0,
        overageAllowed: false,
      }],
    };
    expect(QuotaResultSchema.parse(data)).toEqual(data);
  });
  it('should accept optional resetDate', () => {
    const data = {
      snapshots: [{
        quotaType: 'chat',
        entitlementRequests: 100,
        usedRequests: 10,
        remainingPercentage: 0.9,
        overage: 0,
        overageAllowed: true,
        resetDate: '2026-04-01T00:00:00Z',
      }],
    };
    expect(QuotaResultSchema.parse(data)).toEqual(data);
  });
});
