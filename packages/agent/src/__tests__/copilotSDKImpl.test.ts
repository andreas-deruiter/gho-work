import { describe, it, expect } from 'vitest';
import { CopilotSDKImpl } from '../node/copilotSDKImpl.js';
import type { SessionEvent } from '../common/types.js';

describe('CopilotSDKImpl (real SDK import)', () => {
	it('should dynamically import @github/copilot-sdk without module resolution errors', async () => {
		// This test verifies that the vscode-jsonrpc ESM exports patch is applied.
		// Without the patch, `import('@github/copilot-sdk')` fails because the SDK's
		// session.js imports `from "vscode-jsonrpc/node"` and vscode-jsonrpc lacks
		// an `exports` field for ESM subpath resolution.
		const sdk = await import('@github/copilot-sdk');
		expect(sdk.CopilotClient).toBeDefined();
		expect(typeof sdk.CopilotClient).toBe('function');
		expect(sdk.CopilotSession).toBeDefined();
		expect(sdk.approveAll).toBeDefined();
	});

	it('should construct CopilotClient without throwing', async () => {
		const sdk = await import('@github/copilot-sdk');
		// autoStart: false prevents it from trying to connect to the Copilot CLI
		const client = new sdk.CopilotClient({ autoStart: false });
		expect(client).toBeDefined();
	});

	it('should start real SDK without falling back to mock', async () => {
		// Without useMock flag, CopilotClient starts successfully (auth errors
		// surface later during API calls, not at startup). Crucially, the SDK
		// does NOT silently fall back to mock mode.
		const impl = new CopilotSDKImpl();
		await impl.start();
		expect(impl.isMockFallback).toBe(false);
		await impl.stop();
	});
});

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

	it('should restart in mock mode', async () => {
		const sdk = new CopilotSDKImpl({ useMock: true });
		await sdk.start();
		expect(sdk.isMockFallback).toBe(true);

		// Restart — still mock
		await sdk.restart({ useMock: true });
		expect(sdk.isMockFallback).toBe(true);

		// Verify it works after restart
		const models = await sdk.listModels();
		expect(models.length).toBeGreaterThan(0);

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

	it('should start without falling back to mock when SDK import succeeds', async () => {
		// With the vscode-jsonrpc ESM patch, the real SDK imports and constructs
		// successfully. An invalid token doesn't cause startup failure — auth
		// errors surface later during API calls, not at client.start().
		const sdk = new CopilotSDKImpl({ githubToken: 'invalid-token-for-test' });
		await sdk.start();
		// Real SDK started successfully — not in mock fallback mode
		expect(sdk.isMockFallback).toBe(false);
		await sdk.stop();
	});
});
