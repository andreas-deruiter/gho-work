import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';
import { SkillRegistryImpl } from '../node/skillRegistryImpl.js';

function createMockConversationService() {
	const conversations = new Map<string, { id: string; title: string }>();
	let nextId = 0;
	return {
		createConversation: vi.fn((_workspace: string) => {
			const conv = { id: `conv-${nextId++}`, title: '' };
			conversations.set(conv.id, conv);
			return conv;
		}),
		renameConversation: vi.fn((id: string, title: string) => {
			const conv = conversations.get(id);
			if (conv) { conv.title = title; }
		}),
		getConversation: vi.fn((id: string) => conversations.get(id)),
	};
}

function createMockSession() {
	return {
		sessionId: 'session-1',
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		on: vi.fn((_handler: (event: any) => void) => () => {}),
		send: vi.fn(async () => ''),
		abort: vi.fn(async () => {}),
	};
}

function createMockCopilotSDK() {
	const session = createMockSession();
	return {
		session,
		createSession: vi.fn(() => session),
	};
}

describe('createSetupConversation', () => {
	let agentService: AgentServiceImpl;
	let conversationService: ReturnType<typeof createMockConversationService>;
	let tmpSkillsDir: string;
	let registry: SkillRegistryImpl;

	beforeEach(async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		tmpSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fs.mkdir(path.join(tmpSkillsDir, 'connectors'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'connectors', 'setup.md'),
			'---\ndescription: Help the user set up a connector.\n---\n\n# Setup connector\nHelp the user set up a connector.',
		);

		registry = new SkillRegistryImpl([
			{ id: 'test', priority: 0, basePath: tmpSkillsDir },
		]);
		await registry.scan();

		conversationService = createMockConversationService();
		agentService = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			conversationService as any,
			registry,
		);
	});

	afterEach(() => {
		registry.dispose();
	});

	it('creates a conversation and returns its ID', async () => {
		const convId = await agentService.createSetupConversation();
		expect(convId).toBeDefined();
		expect(typeof convId).toBe('string');
		expect(conversationService.createConversation).toHaveBeenCalled();
	});

	it('titles the conversation "Set up connector"', async () => {
		const convId = await agentService.createSetupConversation();
		expect(conversationService.renameConversation).toHaveBeenCalledWith(convId, 'Set up connector');
	});

	it('stores the setup skill content as install context', async () => {
		const convId = await agentService.createSetupConversation();
		const context = agentService.getInstallContext(convId);
		expect(context).toContain('# Setup connector');
	});

	it('uses empty string as context when setup skill file is missing', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		await fs.rm(path.join(tmpSkillsDir, 'connectors', 'setup.md'));
		await registry.refresh();
		const convId = await agentService.createSetupConversation();
		const context = agentService.getInstallContext(convId);
		expect(context).toBe('');
	});

	it('passes workingDirectory to createSession for setup conversations', async () => {
		const sdk = createMockCopilotSDK();
		sdk.session.on.mockImplementation((handler: (event: any) => void) => {
			setTimeout(() => handler({ type: 'session.idle', data: {} }), 10);
			return () => {};
		});
		const svc = new AgentServiceImpl(
			sdk as any,
			conversationService as any,
			registry,
		);
		const convId = await svc.createSetupConversation();
		const events = [];
		for await (const event of svc.executeTask('hello', { conversationId: convId, workspaceId: 'default' })) {
			events.push(event);
		}
		expect(sdk.createSession).toHaveBeenCalledWith(
			expect.objectContaining({ workingDirectory: os.homedir() }),
		);
	});

	it('does not set workingDirectory for regular conversations', async () => {
		const sdk = createMockCopilotSDK();
		sdk.session.on.mockImplementation((handler: (event: any) => void) => {
			setTimeout(() => handler({ type: 'session.idle', data: {} }), 10);
			return () => {};
		});
		const svc = new AgentServiceImpl(
			sdk as any,
			conversationService as any,
			registry,
		);
		const events = [];
		for await (const event of svc.executeTask('hello', { conversationId: 'regular-conv', workspaceId: 'default' })) {
			events.push(event);
		}
		expect(sdk.createSession).toHaveBeenCalledWith(
			expect.objectContaining({ workingDirectory: undefined }),
		);
	});

	it('throws when conversation service is not available', async () => {
		const noConvService = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			null,
			registry,
		);
		await expect(noConvService.createSetupConversation()).rejects.toThrow('conversation service');
	});

	it('filters disabled skills in _loadSkill', async () => {
		const disabledSkills = ['connectors/setup'];
		const svc = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			conversationService as any,
			registry,
			undefined,
			() => disabledSkills,
		);
		const convId = await svc.createSetupConversation();
		// The setup skill is 'connectors/setup' which is disabled
		const context = svc.getInstallContext(convId);
		// When disabled, the install context should be empty string (skill not loaded)
		expect(context).toBe('');
	});
});
