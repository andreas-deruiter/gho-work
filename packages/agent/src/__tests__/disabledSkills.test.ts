import { describe, it, expect, vi } from 'vitest';
import { MockCopilotSDK } from '../node/mockCopilotSDK.js';

describe('disabledSkills pass-through', () => {
  it('SessionConfig accepts disabledSkills and passes it to createSession', async () => {
    const mock = new MockCopilotSDK();
    await mock.start();
    const createSpy = vi.spyOn(mock, 'createSession');

    const config = {
      sessionId: 'test-1',
      streaming: true,
      disabledSkills: ['connectors/setup', 'auth/github'],
    };
    await mock.createSession(config);

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ disabledSkills: ['connectors/setup', 'auth/github'] }),
    );
  });

  it('SessionConfig accepts undefined disabledSkills', async () => {
    const mock = new MockCopilotSDK();
    await mock.start();
    const createSpy = vi.spyOn(mock, 'createSession');

    await mock.createSession({ sessionId: 'test-2', streaming: true });

    expect(createSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ disabledSkills: expect.anything() }),
    );
  });
});
