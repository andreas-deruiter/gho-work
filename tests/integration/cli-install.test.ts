import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('CLI install conversation lifecycle', () => {
	let tmpSkillsDir: string;

	beforeEach(async () => {
		tmpSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-'));
		await fs.mkdir(path.join(tmpSkillsDir, 'install'), { recursive: true });
		await fs.writeFile(
			path.join(tmpSkillsDir, 'install', 'gh.md'),
			'# Install gh\nInstall the GitHub CLI.',
		);
	});

	afterEach(async () => {
		await fs.rm(tmpSkillsDir, { recursive: true, force: true });
	});

	it('full flow: detect platform → create conversation → verify context', async () => {
		// 1. Platform detection returns valid context
		const { PlatformDetectionServiceImpl } = await import('@gho-work/connectors');
		// execFile mock: returns version string for 'brew', throws for anything else
		const mockExecFile = vi.fn(async (cmd: string, _args: string[]) => {
			if (cmd === 'brew') { return 'Homebrew 4.0.0'; }
			throw new Error(`command not found: ${cmd}`);
		});
		const platformService = new PlatformDetectionServiceImpl(mockExecFile, 'darwin', 'arm64');
		const platformContext = await platformService.detect();
		expect(platformContext.os).toBe('darwin');
		expect(platformContext.packageManagers.brew).toBe(true);

		// 2. Create install conversation via agent service
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
			tmpSkillsDir,
		);

		const convId = await agentService.createInstallConversation('gh', platformContext);

		// 3. Verify conversation has install context with skill + platform info
		expect(convId).toBeDefined();
		const context = agentService.getInstallContext(convId);
		expect(context).toContain('# Install gh');
		expect(context).toContain('darwin');
		expect(context).toContain('arm64');
		expect(context).toContain('brew: available');
		expect(mockConvService.renameConversation).toHaveBeenCalledWith(convId, 'Install GitHub CLI');
	});

	it('rejects unknown tool IDs', async () => {
		const { AgentServiceImpl } = await import('@gho-work/agent');
		const mockSDK = { createSession: vi.fn() };
		const mockConvService = { createConversation: vi.fn(), renameConversation: vi.fn() };
		const agentService = new AgentServiceImpl(
			mockSDK as any,
			mockConvService as any,
			tmpSkillsDir,
		);

		await expect(
			agentService.createInstallConversation('unknown', {
				os: 'darwin', arch: 'arm64',
				packageManagers: { brew: false, winget: false, chocolatey: false },
			}),
		).rejects.toThrow(/skill not found/i);
	});
});
