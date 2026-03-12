import type { PlatformContext, IPlatformDetectionService } from '../common/platformDetection.js';

type ExecFn = (cmd: string, args: string[]) => Promise<string>;

export class PlatformDetectionServiceImpl implements IPlatformDetectionService {
	constructor(
		private readonly execFile: ExecFn,
		private readonly platform: string = process.platform,
		private readonly architecture: string = process.arch,
	) {}

	async detect(): Promise<PlatformContext> {
		const os = this.platform as PlatformContext['os'];
		const arch = this.architecture as PlatformContext['arch'];

		const packageManagers = {
			brew: (os === 'darwin' || os === 'linux') ? await this.checkCommand('brew', ['--version']) : false,
			winget: os === 'win32' ? await this.checkCommand('winget', ['--version']) : false,
			chocolatey: os === 'win32' ? await this.checkCommand('choco', ['--version']) : false,
		};

		return { os, arch, packageManagers };
	}

	private async checkCommand(cmd: string, args: string[]): Promise<boolean> {
		try {
			await this.execFile(cmd, args);
			return true;
		} catch {
			return false;
		}
	}
}
