/**
 * Real CopilotClient wrapper — connects to @github/copilot-sdk.
 * Falls back to MockCopilotSDK when the real SDK cannot start (no auth, no CLI).
 *
 * The SDK is imported dynamically to avoid module resolution failures in environments
 * where vscode-jsonrpc/node is not available (e.g., Vitest).
 */
import type { ICopilotSDK, ISDKSession, SDKQuotaResult } from '../common/copilotSDK.js';
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
 * Defaults workingDirectory to the user's home folder so the agent can access
 * documents across the home directory (and avoids picking up dev-time skills
 * from the project folder).
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
		workingDirectory: config.workingDirectory ?? require('node:os').homedir(),
		availableTools: config.availableTools,
		excludedTools: config.excludedTools,
		disabledSkills: config.disabledSkills,
		mcpServers: config.mcpServers as import('@github/copilot-sdk').SessionConfig['mcpServers'],
		onPermissionRequest: approveAll,
		...(config.customAgents ? { customAgents: config.customAgents as import('@github/copilot-sdk').SessionConfig['customAgents'] } : {}),
		...(config.tools ? { tools: config.tools as import('@github/copilot-sdk').SessionConfig['tools'] } : {}),
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

	/**
	 * Resolve the platform-specific native copilot binary path.
	 * In packaged Electron, process.execPath is the Electron .exe — if the SDK
	 * falls back to spawning a .js entry point via process.execPath it launches
	 * a new Electron instance instead of the copilot CLI, causing an infinite
	 * restart loop. Pointing cliPath at the native binary avoids this entirely.
	 */
	private _resolveNativeBinaryPath(): string | undefined {
		const pkgName = `@github/copilot-${process.platform}-${process.arch}`;
		try {
			// The platform package's main export points directly at the binary.
			// In packaged Electron, require.resolve returns the ASAR-virtual path;
			// native binaries live in app.asar.unpacked (due to asarUnpack config).
			let resolved = require.resolve(pkgName);
			resolved = resolved.replace('app.asar', 'app.asar.unpacked');
			return resolved;
		} catch {
			return undefined;
		}
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
			// Use the native binary directly to avoid the process.execPath problem
			// in packaged Electron (see _resolveNativeBinaryPath docs).
			const nativeBinary = this._resolveNativeBinaryPath();
			if (nativeBinary) {
				clientOptions.cliPath = nativeBinary;
				console.warn('[CopilotSDKImpl] Using native binary:', nativeBinary);
			}

			this._client = new sdk.CopilotClient(clientOptions);
			await this._client.start();
		} catch (error) {
			// Do NOT silently fall back to mock — surface the error so it can be diagnosed.
			this._client = null;
			const msg = error instanceof Error ? error.message : String(error);
			console.error('[CopilotSDKImpl] Real SDK failed to start:', msg);
			throw new Error(`Copilot SDK failed to start: ${msg}`);
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
			...(config?.disabledSkills ? { disabledSkills: config.disabledSkills } : {}),
			...(config?.mcpServers ? { mcpServers: config.mcpServers as import('@github/copilot-sdk').SessionConfig['mcpServers'] } : {}),
			...(config?.tools ? { tools: config.tools as import('@github/copilot-sdk').SessionConfig['tools'] } : {}),
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

	async restart(options?: { githubToken?: string; useMock?: boolean }): Promise<void> {
		await this.stop();
		if (options?.githubToken !== undefined) {
			this._options.githubToken = options.githubToken;
		}
		if (options?.useMock !== undefined) {
			this._options.useMock = options.useMock;
		}
		this._isMockFallback = false;
		await this.start();
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

	async getQuota(): Promise<SDKQuotaResult> {
		if (this._mock) {
			// Mock returns empty quota — no subscription data in test mode
			return { quotaSnapshots: {} };
		}
		if (!this._client) {
			throw new Error('SDK not started. Call start() first.');
		}
		const result = await this._client.rpc.account.getQuota();
		return result as SDKQuotaResult;
	}
}
