/**
 * Real CopilotClient wrapper — connects to @github/copilot-sdk.
 * Falls back to MockCopilotSDK when the real SDK cannot start (no auth, no CLI).
 *
 * The SDK is imported dynamically to avoid module resolution failures in environments
 * where vscode-jsonrpc/node is not available (e.g., Vitest).
 */
import type { ICopilotSDK, ISDKSession } from '../common/copilotSDK.js';
import type {
	SessionConfig,
	MessageOptions,
	SessionEvent,
	SessionMetadata,
	ModelInfo,
	PingResponse,
} from '../common/types.js';
import { MockCopilotSDK } from './mockCopilotSDK.js';

export interface CopilotSDKImplOptions {
	githubToken?: string;
	cwd?: string;
	useMock?: boolean;
}

// Lazy-loaded SDK types (resolved at runtime via dynamic import)
type SDKModule = typeof import('@github/copilot-sdk');
type RealCopilotClient = InstanceType<SDKModule['CopilotClient']>;
type RealCopilotSession = Awaited<ReturnType<RealCopilotClient['createSession']>>;

/**
 * Adapts a real CopilotSession to our ISDKSession interface.
 */
class SDKSessionAdapter implements ISDKSession {
	readonly sessionId: string;

	constructor(private readonly _session: RealCopilotSession) {
		this.sessionId = _session.sessionId;
	}

	async send(options: MessageOptions): Promise<string> {
		return this._session.send(options);
	}

	async sendAndWait(options: MessageOptions, timeout?: number): Promise<SessionEvent | undefined> {
		const result = await this._session.sendAndWait(options, timeout);
		if (!result) {
			return undefined;
		}
		// The SDK's typed SessionEvent is structurally compatible with our generic SessionEvent.
		// Cast through unknown to bridge the type systems.
		return result as unknown as SessionEvent;
	}

	async abort(): Promise<void> {
		return this._session.abort();
	}

	async setModel(model: string): Promise<void> {
		return this._session.setModel(model);
	}

	on(event: string, handler: (event: SessionEvent) => void): () => void;
	on(handler: (event: SessionEvent) => void): () => void;
	on(eventOrHandler: string | ((event: SessionEvent) => void), maybeHandler?: (event: SessionEvent) => void): () => void {
		if (typeof eventOrHandler === 'string') {
			// Cast through unknown to bridge SDK typed events to our generic SessionEvent.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (this._session as any).on(eventOrHandler, maybeHandler);
		}
		// Unfiltered handler — receives all events
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (this._session as any).on((sdkEvent: any) => {
			eventOrHandler(sdkEvent as SessionEvent);
		});
	}

	async getMessages(): Promise<SessionEvent[]> {
		const messages = await this._session.getMessages();
		return messages as unknown as SessionEvent[];
	}

	async disconnect(): Promise<void> {
		return this._session.disconnect();
	}
}

/**
 * Maps SDK ModelInfo to our ModelInfo interface.
 */
function mapModelInfo(sdkModel: import('@github/copilot-sdk').ModelInfo): ModelInfo {
	return {
		id: sdkModel.id,
		name: sdkModel.name,
		capabilities: {
			supports: {
				vision: sdkModel.capabilities.supports.vision,
				reasoningEffort: sdkModel.capabilities.supports.reasoningEffort,
			},
			limits: {
				max_context_window_tokens: sdkModel.capabilities.limits.max_context_window_tokens,
			},
		},
		policy: sdkModel.policy ? { state: sdkModel.policy.state } : undefined,
	};
}

/**
 * Maps our SessionConfig to the SDK's SessionConfig, adding onPermissionRequest.
 */
function mapSessionConfig(
	config: SessionConfig,
	approveAll: import('@github/copilot-sdk').PermissionHandler,
): import('@github/copilot-sdk').SessionConfig {
	return {
		sessionId: config.sessionId,
		model: config.model,
		systemMessage: config.systemMessage,
		streaming: config.streaming,
		workingDirectory: config.workingDirectory,
		availableTools: config.availableTools,
		excludedTools: config.excludedTools,
		mcpServers: config.mcpServers as import('@github/copilot-sdk').SessionConfig['mcpServers'],
		onPermissionRequest: approveAll,
	};
}

export class CopilotSDKImpl implements ICopilotSDK {
	private _client: RealCopilotClient | null = null;
	private _mock: MockCopilotSDK | null = null;
	private _isMockFallback = false;
	private _sdk: SDKModule | null = null;
	private readonly _options: CopilotSDKImplOptions;

	constructor(options?: CopilotSDKImplOptions) {
		this._options = options ?? {};
	}

	/**
	 * Whether the implementation fell back to mock mode.
	 */
	get isMockFallback(): boolean {
		return this._isMockFallback;
	}

	private async _loadSDK(): Promise<SDKModule> {
		if (!this._sdk) {
			this._sdk = await import('@github/copilot-sdk');
		}
		return this._sdk;
	}

	async start(): Promise<void> {
		if (this._options.useMock) {
			this._mock = new MockCopilotSDK();
			await this._mock.start();
			this._isMockFallback = true;
			return;
		}

		try {
			const sdk = await this._loadSDK();
			const clientOptions: import('@github/copilot-sdk').CopilotClientOptions = {
				autoStart: false,
			};
			if (this._options.githubToken) {
				clientOptions.githubToken = this._options.githubToken;
			}
			if (this._options.cwd) {
				clientOptions.cwd = this._options.cwd;
			}

			this._client = new sdk.CopilotClient(clientOptions);
			await this._client.start();
		} catch (error) {
			// Fall back to mock mode if real SDK fails to start
			console.warn(
				'[CopilotSDKImpl] Real SDK failed to start, falling back to mock mode:',
				error instanceof Error ? error.message : String(error),
			);
			this._client = null;
			this._mock = new MockCopilotSDK();
			await this._mock.start();
			this._isMockFallback = true;
		}
	}

	async stop(): Promise<Error[]> {
		if (this._mock) {
			const errors = await this._mock.stop();
			this._mock = null;
			return errors;
		}
		if (this._client) {
			const errors = await this._client.stop();
			this._client = null;
			return errors;
		}
		return [];
	}

	async createSession(config: SessionConfig): Promise<ISDKSession> {
		if (this._mock) {
			return this._mock.createSession(config);
		}
		if (!this._client || !this._sdk) {
			throw new Error('SDK not started. Call start() first.');
		}
		const sdkConfig = mapSessionConfig(config, this._sdk.approveAll);
		const session = await this._client.createSession(sdkConfig);
		return new SDKSessionAdapter(session);
	}

	async resumeSession(sessionId: string, config?: Partial<SessionConfig>): Promise<ISDKSession> {
		if (this._mock) {
			return this._mock.resumeSession(sessionId, config);
		}
		if (!this._client || !this._sdk) {
			throw new Error('SDK not started. Call start() first.');
		}
		const resumeConfig = {
			...(config?.model ? { model: config.model } : {}),
			...(config?.systemMessage ? { systemMessage: config.systemMessage } : {}),
			...(config?.streaming !== undefined ? { streaming: config.streaming } : {}),
			...(config?.workingDirectory ? { workingDirectory: config.workingDirectory } : {}),
			...(config?.availableTools ? { availableTools: config.availableTools } : {}),
			...(config?.excludedTools ? { excludedTools: config.excludedTools } : {}),
			...(config?.mcpServers ? { mcpServers: config.mcpServers as import('@github/copilot-sdk').SessionConfig['mcpServers'] } : {}),
			onPermissionRequest: this._sdk.approveAll,
		};
		const session = await this._client.resumeSession(sessionId, resumeConfig);
		return new SDKSessionAdapter(session);
	}

	async listSessions(): Promise<SessionMetadata[]> {
		if (this._mock) {
			return this._mock.listSessions();
		}
		if (!this._client) {
			throw new Error('SDK not started. Call start() first.');
		}
		const sessions = await this._client.listSessions();
		return sessions.map((s) => ({
			sessionId: s.sessionId,
			startTime: s.startTime,
			modifiedTime: s.modifiedTime,
			summary: s.summary,
		}));
	}

	async deleteSession(sessionId: string): Promise<void> {
		if (this._mock) {
			return this._mock.deleteSession(sessionId);
		}
		if (!this._client) {
			throw new Error('SDK not started. Call start() first.');
		}
		return this._client.deleteSession(sessionId);
	}

	async listModels(): Promise<ModelInfo[]> {
		if (this._mock) {
			return this._mock.listModels();
		}
		if (!this._client) {
			throw new Error('SDK not started. Call start() first.');
		}
		const models = await this._client.listModels();
		return models
			.filter((m) => !m.policy || m.policy.state === 'enabled')
			.map(mapModelInfo);
	}

	async ping(message?: string): Promise<PingResponse> {
		if (this._mock) {
			return this._mock.ping(message);
		}
		if (!this._client) {
			throw new Error('SDK not started. Call start() first.');
		}
		const response = await this._client.ping(message);
		return { message: response.message, timestamp: response.timestamp };
	}
}
