import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function createMockCopilotSDK() {
	return {
		createSession: vi.fn(() => ({ id: 'session-1' })),
	};
}

describe('createSetupConversation', () => {
	let agentService: AgentServiceImpl;
	let conversationService: ReturnType<typeof createMockConversationService>;
	let tmpSkillsDir: string;
	let registry: SkillRegistryImpl;

	beforeEach(async () => {
		const fs = await import('node:fs/promises');
		const os = await import('node:os');
		const path = await import('node:path');
		tmpSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fs.mkdir(path.join(tmpSkillsDir, 'connectors'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'connectors', 'setup.md'),
			'# Setup connector\nHelp the user set up a connector.',
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

	it('throws when conversation service is not available', async () => {
		const noConvService = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			null,
			registry,
		);
		await expect(noConvService.createSetupConversation()).rejects.toThrow('conversation service');
	});
});
