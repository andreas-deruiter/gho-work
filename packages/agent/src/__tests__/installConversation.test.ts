import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformContext } from '@gho-work/base';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';

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
		lastSessionOptions: null as any,
		createSession: vi.fn(function (this: any, opts: any) {
			this.lastSessionOptions = opts;
			return { id: 'session-1' };
		}),
	};
}

const MOCK_PLATFORM: PlatformContext = {
	os: 'darwin',
	arch: 'arm64',
	packageManagers: { brew: true, winget: false, chocolatey: false },
};

describe('createInstallConversation', () => {
	let agentService: AgentServiceImpl;
	let conversationService: ReturnType<typeof createMockConversationService>;
	let copilotSDK: ReturnType<typeof createMockCopilotSDK>;
	let tmpSkillsDir: string;

	beforeEach(async () => {
		const fs = await import('node:fs/promises');
		const os = await import('node:os');
		const path = await import('node:path');
		tmpSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fs.mkdir(path.join(tmpSkillsDir, 'install'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'install', 'gh.md'),
			'# Install gh\nInstall the GitHub CLI.',
		);

		conversationService = createMockConversationService();
		copilotSDK = createMockCopilotSDK();
		// Constructor: (sdk, conversationService, bundledSkillsPath, readContextFiles?)
		agentService = new AgentServiceImpl(
			copilotSDK as any,
			conversationService as any,
			tmpSkillsDir,
		);
	});

	it('creates a conversation titled with the tool name', async () => {
		const convId = await agentService.createInstallConversation('gh', MOCK_PLATFORM);
		expect(conversationService.createConversation).toHaveBeenCalled();
		expect(conversationService.renameConversation).toHaveBeenCalledWith(convId, 'Install GitHub CLI');
	});

	it('reads skill content from bundled skills directory', async () => {
		await agentService.createInstallConversation('gh', MOCK_PLATFORM);
		const context = agentService.getInstallContext('conv-0');
		expect(context).toContain('# Install gh');
	});

	it('injects platform context into install context', async () => {
		await agentService.createInstallConversation('gh', MOCK_PLATFORM);
		const context = agentService.getInstallContext('conv-0');
		expect(context).toContain('darwin');
		expect(context).toContain('arm64');
		expect(context).toContain('brew: available');
	});

	it('throws if skill file not found for toolId', async () => {
		await expect(
			agentService.createInstallConversation('nonexistent', MOCK_PLATFORM),
		).rejects.toThrow(/skill not found/i);
	});

	it('uses workiq tool ID for Work IQ CLI', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		await fs.writeFile(path.join(tmpSkillsDir, 'install', 'workiq.md'), '# Install Work IQ CLI');
		const convId = await agentService.createInstallConversation('workiq', MOCK_PLATFORM);
		expect(conversationService.renameConversation).toHaveBeenCalledWith(convId, 'Install Work IQ CLI');
	});
});
