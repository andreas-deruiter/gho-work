/**
 * Real CopilotClient wrapper — will connect to @github/copilot-sdk.
 * Currently a stub; use MockCopilotSDK for development.
 */
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type { SessionConfig, SessionMetadata } from '../common/types.js';

export class CopilotSDKImpl implements ICopilotSDK {
	async start(): Promise<void> {
		throw new Error('CopilotSDKImpl: @github/copilot-sdk not yet installed. Use MockCopilotSDK.');
	}

	async stop(): Promise<void> {
		throw new Error('Not implemented');
	}

	async createSession(_config: SessionConfig): Promise<ISDKSession> {
		throw new Error('Not implemented');
	}

	async resumeSession(_sessionId: string): Promise<ISDKSession> {
		throw new Error('Not implemented');
	}

	async listSessions(): Promise<SessionMetadata[]> {
		throw new Error('Not implemented');
	}

	async deleteSession(_sessionId: string): Promise<void> {
		throw new Error('Not implemented');
	}

	async ping(): Promise<string> {
		throw new Error('Not implemented');
	}
}
