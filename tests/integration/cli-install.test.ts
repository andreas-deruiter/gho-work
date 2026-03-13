import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillRegistryImpl } from '@gho-work/agent';

describe('CLI setup conversation lifecycle', () => {
	let tmpSkillsDir: string;
	let registry: SkillRegistryImpl;

	beforeEach(async () => {
		tmpSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fs.mkdir(path.join(tmpSkillsDir, 'install'), { recursive: true });
		await fs.mkdir(path.join(tmpSkillsDir, 'connectors'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'install', 'gh.md'),
			'# Install gh\nInstall the GitHub CLI.',
		);
		await fs.writeFile(
			path.join(tmpSkillsDir, 'connectors', 'setup.md'),
			'# Connector Setup\nHelp set up MCP servers and CLI tools.',
		);
		registry = new SkillRegistryImpl([
			{ id: 'test', priority: 0, basePath: tmpSkillsDir },
		]);
		await registry.scan();
	});

	afterEach(async () => {
		registry.dispose();
		await fs.rm(tmpSkillsDir, { recursive: true, force: true });
	});

	it('full flow: detect platform → create conversation → verify context', async () => {
		// 1. Platform detection returns valid context
		const { PlatformDetectionServiceImpl } = await import('@gho-work/connectors');
		const mockExecFile = vi.fn(async (cmd: string, _args: string[]) => {
			if (cmd === 'brew') { return 'Homebrew 4.0.0'; }
			throw new Error(`command not found: ${cmd}`);
		});
		const platformService = new PlatformDetectionServiceImpl(mockExecFile, 'darwin', 'arm64');
		const platformContext = await platformService.detect();
		expect(platformContext.os).toBe('darwin');
		expect(platformContext.packageManagers.brew).toBe(true);

		// 2. Create setup conversation via agent service
		const { AgentServiceImpl } = await import('@gho-work/agent');
		const mockSDK = { createSession: vi.fn().mockReturnValue({ id: 'test' }) };
		const conversations = new Map<string, { id: string; title: string }>();
		let nextId = 0;
		const mockConvService = {
			createConversation: vi.fn(() => {
				const conv = { id: `conv-${nextId++}`, title: '' };
				conversations.set(conv.id, conv);
				return conv;
			}),
			renameConversation: vi.fn((id: string, title: string) => {
				const conv = conversations.get(id);
				if (conv) { conv.title = title; }
			}),
		};

		const agentService = new AgentServiceImpl(
			mockSDK as any,
			mockConvService as any,
			registry,
		);

		const convId = await agentService.createSetupConversation('gh', platformContext);

		// 3. Verify conversation has setup context with skill + platform info
		expect(convId).toBeDefined();
		const context = agentService.getInstallContext(convId);
		expect(context).toContain('Connector Setup');
		expect(context).toContain('Install gh');
		expect(context).toContain('darwin');
		expect(context).toContain('arm64');
		expect(context).toContain('brew: available');
	});

	it('unknown tool IDs create setup conversation without install skill', async () => {
		const { AgentServiceImpl } = await import('@gho-work/agent');
		const mockSDK = { createSession: vi.fn() };
		let nextId = 0;
		const mockConvService = {
			createConversation: vi.fn(() => ({ id: `conv-${nextId++}`, title: '' })),
			renameConversation: vi.fn(),
		};
		const agentService = new AgentServiceImpl(
			mockSDK as any,
			mockConvService as any,
			registry,
		);

		// Unknown tool IDs still create a setup conversation — just without the install skill
		const convId = await agentService.createSetupConversation('unknown', {
			os: 'darwin', arch: 'arm64',
			packageManagers: { brew: false, winget: false, chocolatey: false },
		});
		expect(convId).toBeDefined();
		const context = agentService.getInstallContext(convId);
		expect(context).toContain('Connector Setup');
		expect(context).not.toContain('Install');
	});
});
