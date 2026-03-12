export interface PlatformContext {
	readonly os: 'darwin' | 'win32' | 'linux';
	readonly arch: 'arm64' | 'x64' | 'ia32';
	readonly packageManagers: {
		readonly brew: boolean;
		readonly winget: boolean;
		readonly chocolatey: boolean;
	};
}
