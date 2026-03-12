import { describe, it, expect, vi } from 'vitest';
import { PlatformDetectionServiceImpl } from '../node/platformDetectionImpl.js';

describe('PlatformDetectionService', () => {
	it('detects OS and architecture', async () => {
		const service = new PlatformDetectionServiceImpl(async () => { throw new Error('not found'); });
		const ctx = await service.detect();
		expect(['darwin', 'win32', 'linux']).toContain(ctx.os);
		expect(['arm64', 'x64', 'ia32']).toContain(ctx.arch);
	});

	it('detects brew when available on macOS', async () => {
		const execFile = vi.fn().mockResolvedValue('Homebrew 4.0.0');
		const service = new PlatformDetectionServiceImpl(execFile, 'darwin');
		const ctx = await service.detect();
		expect(ctx.packageManagers.brew).toBe(true);
		expect(execFile).toHaveBeenCalledWith('brew', ['--version']);
	});

	it('reports brew unavailable when not found', async () => {
		const execFile = vi.fn().mockRejectedValue(new Error('not found'));
		const service = new PlatformDetectionServiceImpl(execFile, 'darwin');
		const ctx = await service.detect();
		expect(ctx.packageManagers.brew).toBe(false);
	});

	it('detects winget on Windows', async () => {
		const execFile = vi.fn().mockResolvedValue('v1.7.0');
		const service = new PlatformDetectionServiceImpl(execFile, 'win32');
		const ctx = await service.detect();
		expect(ctx.packageManagers.winget).toBe(true);
	});

	it('skips brew detection on Windows', async () => {
		const execFile = vi.fn().mockResolvedValue('v1.7.0');
		const service = new PlatformDetectionServiceImpl(execFile, 'win32');
		const ctx = await service.detect();
		expect(ctx.packageManagers.brew).toBe(false);
		expect(execFile).not.toHaveBeenCalledWith('brew', ['--version']);
	});

	it('reports no package managers on Linux', async () => {
		const execFile = vi.fn().mockRejectedValue(new Error('not found'));
		const service = new PlatformDetectionServiceImpl(execFile, 'linux');
		const ctx = await service.detect();
		expect(ctx.os).toBe('linux');
		expect(ctx.packageManagers.brew).toBe(false);
		expect(ctx.packageManagers.winget).toBe(false);
		expect(ctx.packageManagers.chocolatey).toBe(false);
	});
});
