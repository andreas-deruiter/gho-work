import { describe, it, expect } from 'vitest';
import { CopilotSDKImpl } from '../node/copilotSDKImpl.js';
import type { SessionEvent } from '../common/types.js';

describe('CopilotSDKImpl (mock fallback mode)', () => {
	it('should instantiate with useMock option', () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		expect(sdk).toBeDefined();
		expect(sdk.isMockFallback).toBe(false); // not yet started
	});

	it('should start in mock mode and report isMockFallback', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();
		expect(sdk.isMockFallback).toBe(true);
		await sdk.stop();
	});

	it('should stop cleanly with no errors', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();
		const errors = await sdk.stop();
		expect(errors).toEqual([]);
	});

	it('should stop cleanly when never started', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		const errors = await sdk.stop();
		expect(errors).toEqual([]);
	});

	it('should list models', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();

		const models = await sdk.listModels();
		expect(models.length).toBeGreaterThan(0);
		for (const model of models) {
			expect(model.id).toBeTruthy();
			expect(model.name).toBeTruthy();
			expect(model.capabilities.supports).toBeDefined();
			expect(model.capabilities.limits.max_context_window_tokens).toBeGreaterThan(0);
		}

		await sdk.stop();
	});

	it('should create a session and send a message with events', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();

		const session = await sdk.createSession({ model: 'gpt-4o' });
		expect(session.sessionId).toBeTruthy();

		const events: SessionEvent[] = [];
		const unsubscribe = session.on((event) => {
			events.push(event);
		});

		const result = await session.sendAndWait({ prompt: 'Hello' });
		expect(result).toBeDefined();
		expect(result!.type).toBe('assistant.message');
		expect(events.length).toBeGreaterThan(0);
		expect(events.some((e) => e.type === 'assistant.message')).toBe(true);

		unsubscribe();
		await session.disconnect();
		await sdk.stop();
	});

	it('should ping and return message + timestamp', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();

		const response = await sdk.ping('hello');
		expect(response.message).toBe('hello');
		expect(typeof response.timestamp).toBe('number');

		const defaultResponse = await sdk.ping();
		expect(defaultResponse.message).toBe('pong');

		await sdk.stop();
	});

	it('should list and delete sessions', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();

		const session = await sdk.createSession({});
		const sessions = await sdk.listSessions();
		expect(sessions.length).toBe(1);
		expect(sessions[0].sessionId).toBe(session.sessionId);

		await sdk.deleteSession(session.sessionId);
		const afterDelete = await sdk.listSessions();
		expect(afterDelete.length).toBe(0);

		await sdk.stop();
	});

	it('should resume an existing session', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();

		const session = await sdk.createSession({});
		const resumed = await sdk.resumeSession(session.sessionId);
		expect(resumed.sessionId).toBe(session.sessionId);

		await sdk.stop();
	});

	it('should fall back to mock when real SDK fails', async () => {
		// No useMock, but no valid token/CLI either — should auto-fallback
		const sdk = new CopilotSDKImpl({ githubToken: 'invalid-token-for-test' });
		await sdk.start();
		expect(sdk.isMockFallback).toBe(true);

		// Should still work in mock mode
		const ping = await sdk.ping();
		expect(ping.message).toBe('pong');

		await sdk.stop();
	});
});
