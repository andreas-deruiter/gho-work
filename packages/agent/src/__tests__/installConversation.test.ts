import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';
import * as fsActual from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

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

const SETUP_SKILL_CONTENT = '# Setup connector\nHelp the user set up a connector.';

describe('createSetupConversation', () => {
	let agentService: AgentServiceImpl;
	let conversationService: ReturnType<typeof createMockConversationService>;
	let tmpSkillsDir: string;

	beforeEach(async () => {
		tmpSkillsDir = await fsActual.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fsActual.mkdir(path.join(tmpSkillsDir, 'connectors'), { recursive: true });
		await fsActual.writeFile(
			path.join(tmpSkillsDir, 'connectors', 'setup.md'),
			SETUP_SKILL_CONTENT,
		);

		conversationService = createMockConversationService();
		agentService = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			conversationService as any,
			tmpSkillsDir,
		);
	});

	afterEach(async () => {
		await fsActual.rm(tmpSkillsDir, { recursive: true, force: true });
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
		await fsActual.rm(path.join(tmpSkillsDir, 'connectors', 'setup.md'));
		const convId = await agentService.createSetupConversation();
		const context = agentService.getInstallContext(convId);
		expect(context).toBe('');
	});

	it('throws when conversation service is not available', async () => {
		const noConvService = new AgentServiceImpl(
			createMockCopilotSDK() as any,
			null,
			tmpSkillsDir,
		);
		await expect(noConvService.createSetupConversation()).rejects.toThrow('conversation service');
	});
});
