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

describe('createSetupConversation', () => {
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
		await fs.mkdir(path.join(tmpSkillsDir, 'connectors'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'install', 'gh.md'),
			'# Install gh\nInstall the GitHub CLI.',
		);
		await fs.writeFile(
			path.join(tmpSkillsDir, 'connectors', 'setup.md'),
			'# Setup connector\nHelp the user set up a connector.',
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

	it('creates a conversation titled "Set up connector" when no query given', async () => {
		const convId = await agentService.createSetupConversation();
		expect(conversationService.createConversation).toHaveBeenCalled();
		expect(conversationService.renameConversation).toHaveBeenCalledWith(convId, 'Set up connector');
	});

	it('creates a conversation titled "Set up <query>" when query provided', async () => {
		const convId = await agentService.createSetupConversation('gh', MOCK_PLATFORM);
		expect(conversationService.renameConversation).toHaveBeenCalledWith(convId, 'Set up gh');
	});

	it('includes setup skill content in the system message', async () => {
		await agentService.createSetupConversation();
		const context = agentService.getInstallContext('conv-0');
		expect(context).toContain('# Setup connector');
	});

	it('appends install skill when query matches a known tool ID', async () => {
		await agentService.createSetupConversation('gh', MOCK_PLATFORM);
		const context = agentService.getInstallContext('conv-0');
		expect(context).toContain('# Install gh');
	});

	it('injects platform context when platformContext is provided', async () => {
		await agentService.createSetupConversation('gh', MOCK_PLATFORM);
		const context = agentService.getInstallContext('conv-0');
		expect(context).toContain('darwin');
		expect(context).toContain('arm64');
		expect(context).toContain('brew: available');
	});

	it('does not include platform info when platformContext is not provided', async () => {
		await agentService.createSetupConversation('gh');
		const context = agentService.getInstallContext('conv-0');
		expect(context).not.toContain('## Platform');
	});

	it('does not throw when query does not match a known tool ID', async () => {
		await expect(
			agentService.createSetupConversation('nonexistent', MOCK_PLATFORM),
		).resolves.toBeDefined();
	});

	it('supports workiq tool ID', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		await fs.writeFile(path.join(tmpSkillsDir, 'install', 'workiq.md'), '# Install Work IQ CLI');
		const convId = await agentService.createSetupConversation('workiq', MOCK_PLATFORM);
		const context = agentService.getInstallContext(convId);
		expect(context).toContain('# Install Work IQ CLI');
	});
});
