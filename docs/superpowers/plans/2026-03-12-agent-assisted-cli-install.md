# Agent-Assisted CLI Tool Installation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace passive "Install guide" links with an "Install" button that starts an agent conversation to handle CLI tool installation, including auth setup.

**Architecture:** Extends `AgentServiceImpl` with a new `createInstallConversation()` method (requires adding `IConversationService` + `bundledSkillsPath` constructor params — existing call sites must be updated). Adds `IPlatformDetectionService` alongside existing CLI detection. The IPC handler layer orchestrates cross-service calls (agent + connectors). "Install" buttons in the Connectors settings CLI Tools panel trigger IPC calls that create pre-contextualized conversations.

**Tech Stack:** TypeScript, better-sqlite3 (conversation persistence), @github/copilot-sdk (agent sessions), Vitest (tests), Playwright (E2E)

**Spec:** [Agent-Assisted CLI Install Design](../specs/2026-03-12-agent-assisted-cli-install-design.md)

**Deliberate spec deviations:**
- **Type name:** Spec says `IPlatformContext`; plan uses `PlatformContext` (plain data type, not a DI service — no `I` prefix per codebase convention)
- **Skill loading:** Spec says "loaded by Phase 4 skill loading system"; plan uses `fs.readFile` directly (Phase 4 skill loader may not exist yet — migrate when available)
- **Tool ID:** Spec says `wiq`; plan uses `workiq` (matching `cliDetectionImpl.ts` line 64)
- **Refresh mechanism:** Spec describes `onDidCompleteTask` → `rescan()` → `onDidChangeDetection`; plan uses existing `AGENT_EVENT` channel `done` type → `ICLIDetectionService.refresh()` → `onDidChangeTools` (all existing APIs, no new events/methods needed)

**Codebase conventions to follow:**
- Import `createServiceIdentifier` from `@gho-work/base` (not `@gho-work/platform`)
- Place tests in `packages/<pkg>/src/__tests__/` (not alongside source files)
- The Work IQ CLI tool ID is `workiq` in `cliDetectionImpl.ts` — use `workiq` consistently
- IPC channels are string constants in `IPC_CHANNELS` object; schemas are exported separately as `<Name>Schema` + `type <Name>` (see `ipc.ts` pattern)
- IPC handlers live in `packages/electron/` (trace from `createMainProcess` in `apps/desktop/src/main/index.ts`)
- `PlatformContext` type is defined in `packages/base` (shared type, avoids cross-package import violations between agent and connectors)
- `AgentServiceImpl` constructor currently takes `(ICopilotSDK, readContextFiles?)` — this plan adds 2 new params
- The `done` event in `AgentEventSchema` has only `{ type: 'done', messageId: string }` — no `conversationTitle` field

**Dependencies:** Self-contained. The install skill loader reads Markdown files directly with `fs.promises.readFile` — it does not depend on Phase 4's general skill loading system. When the Phase 4 skill loader is implemented, install skills can be migrated to use it.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/base/src/common/platformContext.ts` | `PlatformContext` shared type (avoids import hierarchy violations) |
| `packages/connectors/src/common/platformDetection.ts` | `IPlatformDetectionService` interface — OS, arch, package manager availability |
| `packages/connectors/src/node/platformDetectionImpl.ts` | Implementation using `process.platform`, `process.arch`, PATH scanning for brew/winget/chocolatey |
| `packages/connectors/src/__tests__/platformDetection.test.ts` | Unit tests for platform detection |
| `skills/install/gh.md` | Install skill for GitHub CLI |
| `skills/install/pandoc.md` | Install skill for pandoc |
| `skills/install/git.md` | Install skill for git |
| `skills/install/mgc.md` | Install skill for Microsoft Graph CLI |
| `skills/install/az.md` | Install skill for Azure CLI |
| `skills/install/gcloud.md` | Install skill for Google Cloud CLI |
| `skills/install/workiq.md` | Install skill for Work IQ CLI |
| `packages/agent/src/__tests__/installConversation.test.ts` | Unit tests for install conversation creation |
| `tests/integration/cli-install.test.ts` | Integration test: IPC → agent → conversation lifecycle |
| `tests/e2e/cli-install.spec.ts` | Playwright E2E test for install button flow |

### Modified files

| File | Change |
|------|--------|
| `packages/agent/src/common/agent.ts` | Add `createInstallConversation()` to `IAgentService` |
| `packages/agent/src/node/agentServiceImpl.ts` | Implement `createInstallConversation()` |
| `packages/platform/src/ipc/common/ipc.ts` | Add IPC channels for install conversation and platform detection |
| `apps/desktop/src/main/ipcHandlers.ts` (or equivalent) | Wire new IPC handlers — orchestration layer that calls both agent and connectors services |
| `packages/ui/src/browser/settings/connectorSettings.ts` (or equivalent) | Add "Install" button to CLI Tools panel |

---

## Chunk 1: Platform Detection Service

### Task 1: Platform detection interface and tests

**Files:**
- Create: `packages/connectors/src/common/platformDetection.ts`
- Create: `packages/connectors/src/__tests__/platformDetection.test.ts`

- [ ] **Step 1: Write the interface**

```typescript
// packages/connectors/src/common/platformDetection.ts
import { createServiceIdentifier } from '@gho-work/base';
import type { PlatformContext } from '@gho-work/base';

// Re-export for convenience
export type { PlatformContext } from '@gho-work/base';

export interface IPlatformDetectionService {
	detect(): Promise<PlatformContext>;
}

export const IPlatformDetectionService = createServiceIdentifier<IPlatformDetectionService>('IPlatformDetectionService');
```

**Note:** `PlatformContext` is defined in `packages/base/src/common/platformContext.ts` (Task 3, Step 1) to avoid import hierarchy violations. The connectors package re-exports it for convenience.

- [ ] **Step 2: Write failing tests**

```typescript
// packages/connectors/src/__tests__/platformDetection.test.ts
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
		// brew --version should not have been called
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run packages/connectors/src/__tests__/platformDetection.test.ts`
Expected: FAIL — `platformDetectionImpl.js` not found

### Task 2: Platform detection implementation

**Files:**
- Create: `packages/connectors/src/node/platformDetectionImpl.ts`

- [ ] **Step 1: Implement the service**

```typescript
// packages/connectors/src/node/platformDetectionImpl.ts
import { PlatformContext, IPlatformDetectionService } from '../common/platformDetection.js';

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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run packages/connectors/src/__tests__/platformDetection.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 3: Add exports to package barrel**

Add `PlatformContext`, `IPlatformDetectionService` to the `packages/connectors` common exports. Add `PlatformDetectionServiceImpl` to the node exports.

- [ ] **Step 4: Lint and build**

Run: `npx turbo lint && npx turbo build`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/common/platformDetection.ts \
       packages/connectors/src/__tests__/platformDetection.test.ts \
       packages/connectors/src/node/platformDetectionImpl.ts
git commit -m "feat(connectors): add platform detection service for CLI install"
```

---

## Chunk 2: Install Conversation on Agent Service

### Task 3: Extend IAgentService with createInstallConversation

**Files:**
- Modify: `packages/agent/src/common/agent.ts`
- Modify: `packages/agent/src/node/agentServiceImpl.ts`
- Create: `packages/agent/src/__tests__/installConversation.test.ts`

**Architecture note:** `AgentServiceImpl` already depends on `IConversationService` and `ICopilotSDK`. The `createInstallConversation` method uses these existing dependencies. `PlatformContext` is defined in `packages/base` (shared type) to avoid a connectors→agent import. The `toolId` → skill mapping uses `workiq` (matching `cliDetectionImpl.ts`), not `wiq`.

- [ ] **Step 1: Define PlatformContext in packages/base**

Create `packages/base/src/common/platformContext.ts`:

```typescript
// packages/base/src/common/platformContext.ts
export interface PlatformContext {
	readonly os: 'darwin' | 'win32' | 'linux';
	readonly arch: 'arm64' | 'x64' | 'ia32';
	readonly packageManagers: {
		readonly brew: boolean;
		readonly winget: boolean;
		readonly chocolatey: boolean;
	};
}
```

Export from `packages/base` barrel.

- [ ] **Step 2: Write failing tests**

```typescript
// packages/agent/src/__tests__/installConversation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformContext } from '@gho-work/base';
import { AgentServiceImpl } from '../node/agentServiceImpl.js';

// Mock dependencies matching existing test patterns in this package
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
		// Create a temp directory with a test skill file
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
		expect(conversationService.renameConversation).toHaveBeenCalledWith(
			convId,
			'Install GitHub CLI',
		);
	});

	it('reads skill content from bundled skills directory', async () => {
		await agentService.createInstallConversation('gh', MOCK_PLATFORM);

		// The install context should contain the skill content
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
		await fs.writeFile(
			path.join(tmpSkillsDir, 'install', 'workiq.md'),
			'# Install Work IQ CLI',
		);

		const convId = await agentService.createInstallConversation('workiq', MOCK_PLATFORM);
		expect(conversationService.renameConversation).toHaveBeenCalledWith(
			convId,
			'Install Work IQ CLI',
		);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/agent/src/__tests__/installConversation.test.ts`
Expected: FAIL — `createInstallConversation` not found on `AgentServiceImpl`

- [ ] **Step 3: Add methods to IAgentService interface**

In `packages/agent/src/common/agent.ts`:

```typescript
import type { PlatformContext } from '@gho-work/base';

// Add to IAgentService:
createInstallConversation(toolId: string, platformContext: PlatformContext): Promise<string>;
getInstallContext(conversationId: string): string | undefined;
```

Both methods must be on the interface (not just the impl) because IPC handlers access services through the DI container typed as `IAgentService`.

- [ ] **Step 4: Modify AgentServiceImpl constructor**

The current constructor is:
```typescript
constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _readContextFiles?: () => Promise<string>,
) {}
```

Change to:
```typescript
constructor(
    private readonly _sdk: ICopilotSDK,
    private readonly _conversationService: IConversationService | null,
    private readonly _bundledSkillsPath: string,
    private readonly _readContextFiles?: () => Promise<string>,
) {}
```

**Update all existing call sites** (there are exactly 2):

1. **`packages/electron/src/main/mainProcess.ts` line 202**: Currently `new AgentServiceImpl(sdk)`. Change to:
   ```typescript
   const bundledSkillsPath = path.join(app.getAppPath(), 'resources', 'skills');
   const agentService = new AgentServiceImpl(sdk, conversationService!, bundledSkillsPath);
   ```
   Note: `conversationService` is created at line 83-88 (before line 202), but it can be `null` if `storageService` or `workspaceId` is missing. Move the `agentService` construction inside the `if (storageService && workspaceId)` block, or make `_conversationService` nullable and throw from `createInstallConversation` if null. The simpler approach: make the constructor accept `IConversationService | null` and guard in `createInstallConversation`:
   ```typescript
   if (!this._conversationService) {
       throw new Error('Install conversations require conversation service (no workspace)');
   }
   ```

2. **`packages/electron/src/agentHost/agentHostMain.ts` line 20**: Currently `new AgentServiceImpl(sdk)`. The agent host is a utility process without database access — it cannot support install conversations. Change to:
   ```typescript
   const agentService = new AgentServiceImpl(sdk, null, '');
   ```
   Install conversation methods will throw if called through the agent host (acceptable — install is always triggered from the main process).

**Update existing tests** that instantiate `AgentServiceImpl`:
- `packages/agent/src/__tests__/agentService.test.ts` (lines 13, 133, 152): add `null, ''` as 2nd and 3rd args
- `packages/agent/src/__tests__/agentIntegration.test.ts` (line 23): add `null, ''` as 2nd and 3rd args

- [ ] **Step 5: Implement createInstallConversation and getInstallContext**

In `packages/agent/src/node/agentServiceImpl.ts`:

```typescript
import type { PlatformContext } from '@gho-work/base';
import type { IConversationService } from '../common/conversation.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Add private field:
private readonly _installContexts = new Map<string, string>();

async createInstallConversation(toolId: string, platformContext: PlatformContext): Promise<string> {
	if (!this._conversationService) {
		throw new Error('Install conversations require conversation service (no workspace)');
	}

	const skillContent = await this._loadInstallSkill(toolId);
	if (!skillContent) {
		throw new Error(`Install skill not found for tool: ${toolId}`);
	}

	const platformInfo = [
		`## Platform`,
		`- OS: ${platformContext.os}`,
		`- Architecture: ${platformContext.arch}`,
		`- Package managers: ${formatPackageManagers(platformContext.packageManagers)}`,
	].join('\n');

	const systemMessage = `${skillContent}\n\n${platformInfo}`;

	const toolNames: Record<string, string> = {
		gh: 'GitHub CLI', pandoc: 'pandoc', git: 'git',
		mgc: 'Microsoft Graph CLI', az: 'Azure CLI',
		gcloud: 'Google Cloud CLI', workiq: 'Work IQ CLI',
	};
	const conversation = this._conversationService.createConversation('default');
	this._conversationService.renameConversation(
		conversation.id,
		`Install ${toolNames[toolId] ?? toolId}`,
	);

	this._installContexts.set(conversation.id, systemMessage);
	return conversation.id;
}

getInstallContext(conversationId: string): string | undefined {
	return this._installContexts.get(conversationId);
}

private async _loadInstallSkill(toolId: string): Promise<string | undefined> {
	const skillPath = path.join(this._bundledSkillsPath, 'install', `${toolId}.md`);
	try {
		return await fs.readFile(skillPath, 'utf-8');
	} catch {
		return undefined;
	}
}
```

And the helper (module-level):

```typescript
function formatPackageManagers(pm: PlatformContext['packageManagers']): string {
	const items: string[] = [];
	items.push(pm.brew ? 'brew: available' : 'brew: not found');
	items.push(pm.winget ? 'winget: available' : 'winget: not found');
	items.push(pm.chocolatey ? 'chocolatey: available' : 'chocolatey: not found');
	return items.join(', ');
}
```

- [ ] **Step 6: Update executeTask to use install context**

In `AgentServiceImpl.executeTask()`, after the existing system message construction:

```typescript
// After building systemContent from _readContextFiles and context.systemPrompt:
const installContext = this._installContexts.get(context.conversationId);
if (installContext) {
	systemContent = installContext + (systemContent ? '\n\n' + systemContent : '');
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run packages/agent/src/__tests__/installConversation.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 8: Run existing agent tests to verify no regressions**

Run: `npx vitest run packages/agent/src/__tests__/agentService.test.ts packages/agent/src/__tests__/agentIntegration.test.ts`
Expected: All existing tests PASS (with updated constructor calls)

- [ ] **Step 9: Lint and build**

Run: `npx turbo lint && npx turbo build`
Expected: Clean

- [ ] **Step 10: Commit**

```bash
git add packages/base/src/common/platformContext.ts \
       packages/agent/src/common/agent.ts \
       packages/agent/src/node/agentServiceImpl.ts \
       packages/agent/src/__tests__/installConversation.test.ts \
       packages/agent/src/__tests__/agentService.test.ts \
       packages/agent/src/__tests__/agentIntegration.test.ts \
       packages/electron/src/main/mainProcess.ts \
       packages/electron/src/agentHost/agentHostMain.ts
git commit -m "feat(agent): add createInstallConversation for CLI tool install"
```

---

## Chunk 3: IPC Wiring and CLI Detection Refresh

### Task 4: Add IPC channels and wire handlers

**Files:**
- Modify: `packages/platform/src/ipc/common/ipc.ts`
- Modify: `apps/desktop/src/main/ipcHandlers.ts` (or equivalent — trace from `createMainProcess` in `apps/desktop/src/main/index.ts`)

**Architecture note:** The IPC handler layer is the orchestration point. It has access to both `IAgentService` (from `packages/agent`) and `IPlatformDetectionService` (from `packages/connectors`), so it can call both without violating the import hierarchy. The renderer triggers a CLI detection refresh by listening to existing `AGENT_EVENT` channel events — no new `rescan()` method needed, since `ICLIDetectionService.refresh()` already emits `onDidChangeTools`.

- [ ] **Step 1: Add IPC channel definitions**

In `packages/platform/src/ipc/common/ipc.ts`:

**Add channel constants** (in `IPC_CHANNELS` object, after `CLI_REFRESH`):

```typescript
CLI_CREATE_INSTALL_CONVERSATION: 'cli:create-install-conversation',
CLI_GET_PLATFORM_CONTEXT: 'cli:get-platform-context',
```

**Add schemas** (after the existing `CLIDetectResponseSchema`):

```typescript
export const CLICreateInstallRequestSchema = z.object({
	toolId: z.string(),
});
export type CLICreateInstallRequest = z.infer<typeof CLICreateInstallRequestSchema>;

export const CLICreateInstallResponseSchema = z.object({
	conversationId: z.string(),
});
export type CLICreateInstallResponse = z.infer<typeof CLICreateInstallResponseSchema>;

export const PlatformContextSchema = z.object({
	os: z.enum(['darwin', 'win32', 'linux']),
	arch: z.enum(['arm64', 'x64', 'ia32']),
	packageManagers: z.object({
		brew: z.boolean(),
		winget: z.boolean(),
		chocolatey: z.boolean(),
	}),
});
export type PlatformContextIPC = z.infer<typeof PlatformContextSchema>;
```

- [ ] **Step 2: Wire IPC handlers in main process**

In the main process IPC handler file, add handlers:

```typescript
// CLI_GET_PLATFORM_CONTEXT handler
ipcMain.handle(IPC_CHANNELS.CLI_GET_PLATFORM_CONTEXT, async () => {
	const platformDetection = serviceAccessor.get(IPlatformDetectionService);
	return platformDetection.detect();
});

// CLI_CREATE_INSTALL_CONVERSATION handler — orchestrates across services
ipcMain.handle(IPC_CHANNELS.CLI_CREATE_INSTALL_CONVERSATION, async (_event, { toolId }) => {
	const platformDetection = serviceAccessor.get(IPlatformDetectionService);
	const agentService = serviceAccessor.get(IAgentService);

	const platformContext = await platformDetection.detect();
	const conversationId = await agentService.createInstallConversation(toolId, platformContext);

	return { conversationId };
});
```

- [ ] **Step 3: Lint and build**

Run: `npx turbo lint && npx turbo build`
Expected: Clean

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/ipc/common/ipc.ts \
       apps/desktop/src/main/ipcHandlers.ts
git commit -m "feat(platform): add IPC channels for CLI install conversations"
```

---

## Chunk 4: Install Skills (Bundled Markdown Files)

### Task 5: Write install skills for core tools

**Files:**
- Create: `skills/install/gh.md`
- Create: `skills/install/pandoc.md`
- Create: `skills/install/git.md`

- [ ] **Step 1: Create skills directory**

Run: `mkdir -p skills/install`

- [ ] **Step 2: Write gh install skill**

`skills/install/gh.md` — GitHub CLI install skill covering:
- What gh enables in GHO Work (issues, PRs, repos, actions)
- macOS: `brew install gh`, fallback to `.pkg` from GitHub releases
- Windows: `winget install --id GitHub.cli`, fallback to `choco install gh`, fallback to `.msi`
- Post-install: `gh auth login` (browser OAuth, select HTTPS, scopes: repo, read:org)
- Verification: `gh auth status` should show logged-in user
- Common pitfalls: brew not installed (install Homebrew first), corporate SSO (use `gh auth login --hostname`), multiple accounts
- Resume: check `gh --version` and `gh auth status` to assess state

- [ ] **Step 3: Write pandoc install skill**

`skills/install/pandoc.md` — simplest skill:
- What pandoc enables (DOCX, PDF, HTML conversion)
- macOS: `brew install pandoc`
- Windows: `winget install --id JohnMacFarlane.Pandoc`
- No post-install auth
- Verification: `pandoc --version`
- Common pitfalls: LaTeX needed for PDF output (`brew install basictex` or `tinytex`), PATH issues on Windows
- Resume: check `pandoc --version`

- [ ] **Step 4: Add git to CLI detection tool list**

`git` is not currently in `cliDetectionImpl.ts`'s tool definitions (interface: `CLIToolDef` with fields `id`, `name`, `versionArgs`, `versionPattern`, `authArgs?`, `installUrl`, `authCommand?`). Add it:

```typescript
// In CLI_TOOLS array in packages/connectors/src/node/cliDetectionImpl.ts
{
	id: 'git',
	name: 'git',
	versionArgs: ['--version'],
	versionPattern: /git version (\d+\.\d+[\.\d]*)/,
	installUrl: 'https://git-scm.com',
},
```

Update the CLI detection test to expect `git` in the tool list — change the expected IDs from `['gh', 'mgc', 'az', 'gcloud', 'pandoc', 'workiq']` to `['gh', 'mgc', 'az', 'gcloud', 'pandoc', 'workiq', 'git']`.

- [ ] **Step 5: Write git install skill**

`skills/install/git.md` — usually pre-installed:
- macOS: Xcode Command Line Tools (`xcode-select --install`), or `brew install git`
- Windows: `winget install --id Git.Git`
- Post-install: `git config --global user.name` and `user.email`, credential helper setup
- Verification: `git --version`, `git config user.name`
- Common pitfalls: Xcode CLT prompt on first use, credential manager differences (macOS keychain vs Windows credential manager)
- Resume: check `git --version` and `git config user.name`

- [ ] **Step 6: Commit**

```bash
git add skills/install/gh.md skills/install/pandoc.md skills/install/git.md \
       packages/connectors/src/node/cliDetectionImpl.ts \
       packages/connectors/src/__tests__/cliDetection.test.ts
git commit -m "feat: add install skills for core CLI tools (gh, pandoc, git)"
```

### Task 6: Write install skills for integration tools

**Files:**
- Create: `skills/install/mgc.md`
- Create: `skills/install/az.md`
- Create: `skills/install/gcloud.md`
- Create: `skills/install/workiq.md`

- [ ] **Step 1: Write mgc install skill** (most complex)

`skills/install/mgc.md` — Microsoft Graph CLI:
- What mgc enables (Outlook, OneDrive, Teams, Calendar, SharePoint)
- macOS: `brew install microsoft/msgraph/msgraph-cli`, fallback to `dotnet tool install Microsoft.Graph.Cli -g`
- Windows: `winget install Microsoft.GraphCLI`, fallback to dotnet global tool
- Post-install auth: `mgc login` with device code flow (explains: open browser, enter code, approve permissions)
- Required scopes: `User.Read`, `Mail.Read`, `Files.Read`, `Calendars.Read` (minimum for GHO Work features)
- Verification: `mgc me get` should return user profile JSON
- Common pitfalls: .NET runtime needed for dotnet tool install, tenant restrictions, conditional access policies blocking device code, multiple Microsoft accounts
- Resume: check `mgc --version`, `mgc me get`

- [ ] **Step 2: Write az install skill**

`skills/install/az.md` — Azure CLI:
- macOS: `brew install azure-cli`
- Windows: `winget install -e --id Microsoft.AzureCLI`
- Post-install: `az login` (opens browser)
- Verification: `az account show`
- Common pitfalls: Python dependency issues on some macOS versions, proxy configuration
- Resume: check `az --version`, `az account show`

- [ ] **Step 3: Write gcloud install skill**

`skills/install/gcloud.md` — Google Cloud CLI:
- macOS: `brew install --cask google-cloud-sdk` (note: cask, not formula)
- Windows: installer from Google, or `winget install Google.CloudSDK`
- Post-install: `gcloud init` (interactive, opens browser for OAuth)
- Verification: `gcloud auth list` should show active account
- Common pitfalls: PATH setup needed after cask install (`source "$(brew --prefix)/share/google-cloud-sdk/path.zsh.inc"`), multiple projects
- Resume: check `gcloud --version`, `gcloud auth list`

- [ ] **Step 4: Write wiq install skill**

`skills/install/workiq.md` — Work IQ CLI:
- Depends on mgc being installed and authenticated first (check this before proceeding)
- Installation steps per platform (TBD — depends on Work IQ CLI distribution method)
- Post-install: auth typically shared with mgc
- Verification: version check and test query
- Common pitfalls: mgc not authenticated, insufficient permissions
- Resume: check version and mgc auth status

- [ ] **Step 5: Commit**

```bash
git add skills/install/mgc.md skills/install/az.md \
       skills/install/gcloud.md skills/install/workiq.md
git commit -m "feat: add install skills for integration CLI tools (mgc, az, gcloud, workiq)"
```

---

## Chunk 5: UI — Install Button in Connectors Settings

### Task 7: Add "Install" button to CLI Tools panel

**Files:**
- Modify: the Connectors settings panel (likely `packages/ui/src/browser/settings/connectorSettings.ts` or equivalent — depends on Phase 4 deliverable 7 creating this panel)

**Note:** This task assumes the Connectors settings panel exists from Phase 4 deliverable 7 (tool activity panel) or Phase 3 (connector settings UI). If it doesn't exist yet, this task creates the CLI Tools subsection within whatever settings infrastructure is available.

- [ ] **Step 1: Add Install button to missing tool rows**

In the CLI Tools panel rendering code, for each tool where `status.installed === false`:

```typescript
// Instead of:
// const link = h('a.cli-install-link', { href: status.installUrl }, 'Install guide');

// Use:
const installBtn = h('button.cli-install-btn', {
	onclick: () => this.handleInstallClick(status.id),
}, 'Install');
```

- [ ] **Step 2: Implement handleInstallClick**

```typescript
// Track install conversation IDs so we know when to refresh CLI detection
private readonly _installConversationIds = new Set<string>();

private async handleInstallClick(toolId: string): Promise<void> {
	const result = await ipcRenderer.invoke(
		IPC_CHANNELS.CLI_CREATE_INSTALL_CONVERSATION,
		{ toolId },
	);

	// Track this conversation ID for the refresh listener
	this._installConversationIds.add(result.conversationId);

	// Navigate to the new conversation
	this.chatNavigation.openConversation(result.conversationId);
}
```

- [ ] **Step 3: Add auto-refresh listener**

The `done` event in `AgentEventSchema` has only `{ type: 'done', messageId: string }` — no `conversationTitle` or `conversationId`. The renderer must track install conversation IDs locally (from Step 2) and match by the active conversation when a `done` event arrives:

```typescript
// In the Connectors settings panel initialization
this._register(this.agentEvents.onDidReceiveEvent((event) => {
	if (event.type === 'done') {
		// Check if the currently active conversation is an install conversation
		const activeConvId = this.chatNavigation.getActiveConversationId();
		if (activeConvId && this._installConversationIds.has(activeConvId)) {
			this._installConversationIds.delete(activeConvId);
			this.cliDetectionService.refresh();
		}
	}
}));
```

**Alternative (cleaner but requires schema change):** Extend the `done` event to include `conversationId`. If other features also need this, it's worth doing — but for now the local tracking approach avoids changing the shared schema.

Note: `refresh()` already exists on `ICLIDetectionService` and emits `onDidChangeTools`. No new methods needed on the detection service.

- [ ] **Step 4: Lint and build**

Run: `npx turbo lint && npx turbo build`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/browser/settings/
git commit -m "feat(ui): add Install button for missing CLI tools in Connectors settings"
```

---

## Chunk 6: Integration Test, E2E Test, and Verification

### Task 8: Integration test — IPC → agent → conversation lifecycle

**Files:**
- Create: `tests/integration/cli-install.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/cli-install.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
		const { PlatformDetectionServiceImpl } = await import(
			'@gho-work/connectors/node/platformDetectionImpl'
		);
		const platformService = new PlatformDetectionServiceImpl(
			async () => 'Homebrew 4.0.0',
			'darwin',
			'arm64',
		);
		const platformContext = await platformService.detect();
		expect(platformContext.os).toBe('darwin');
		expect(platformContext.packageManagers.brew).toBe(true);

		// 2. Create install conversation via agent service
		const { AgentServiceImpl } = await import('@gho-work/agent/node/agentServiceImpl');
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
		const { AgentServiceImpl } = await import('@gho-work/agent/node/agentServiceImpl');
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
```

**Note:** The exact wiring depends on the DI container setup from Phase 2. Fill in the service instantiation following the same pattern as existing integration tests in `tests/integration/`.

- [ ] **Step 2: Run integration test**

Run: `npx vitest run tests/integration/cli-install.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cli-install.test.ts
git commit -m "test: add integration test for CLI install conversation lifecycle"
```

### Task 9: Playwright E2E test

**Files:**
- Create: `tests/e2e/cli-install.spec.ts`

- [ ] **Step 1: Write E2E test**

```typescript
// tests/e2e/cli-install.spec.ts
import { test, expect, _electron } from '@playwright/test';

test.describe('CLI tool install flow', () => {
	test('Install button opens conversation with skill context', async () => {
		const app = await _electron.launch({ args: ['apps/desktop/out/main/index.js'] });
		const page = await app.firstWindow();

		// Navigate to Settings > Connectors > CLI Tools
		// (exact selectors depend on the settings UI implementation)
		await page.click('[data-testid="settings-btn"]');
		await page.click('[data-testid="connectors-tab"]');
		await page.click('[data-testid="cli-tools-tab"]');

		// Find a missing tool and click Install
		const installBtn = page.locator('.cli-install-btn').first();
		await expect(installBtn).toBeVisible();
		const toolName = await installBtn.evaluate(
			(el) => el.closest('.cli-detect-item')?.querySelector('.cli-name')?.textContent,
		);

		await installBtn.click();

		// Verify: navigated to a new conversation
		await expect(page.locator('.main-title')).toContainText(`Install`);

		// Verify: conversation has content (agent started)
		await expect(page.locator('.chat-messages')).not.toBeEmpty();

		// Cleanup
		await app.close();
	});
});
```

- [ ] **Step 2: Run E2E test**

Run: `npx playwright test tests/e2e/cli-install.spec.ts`
Expected: PASS (may need mock SDK for deterministic behavior — adjust based on test infrastructure from Phase 2/5)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cli-install.spec.ts
git commit -m "test: add E2E test for CLI tool install button flow"
```

### Task 10: Manual verification and supervisor

- [ ] **Step 1: Run the app**

Run: `npm run desktop:dev`

- [ ] **Step 2: Navigate to Connectors settings > CLI Tools**

Verify:
- Installed tools show version and status
- Missing tools show "Install" button (not "Install guide" link)

- [ ] **Step 3: Click Install on a missing tool (or pandoc if all are installed — uninstall it first)**

Verify:
- New conversation opens titled "Install {tool name}"
- Agent starts working, references platform info
- Agent runs install commands with permission prompts
- After install, agent verifies with version check
- If auth needed, agent walks through it

- [ ] **Step 4: Return to Connectors settings**

Verify: the tool now shows as installed with version

- [ ] **Step 5: Take screenshots at each checkpoint**

Use Playwright `page.screenshot()` or manual screenshots. Review for: correct layout, no error states, no console errors.

- [ ] **Step 6: Invoke supervisor skill**

Run the supervisor sub-agent against the full deliverable before declaring complete.

- [ ] **Step 7: Commit final state**

```bash
git add -A
git commit -m "feat: agent-assisted CLI tool installation — complete"
```

---

## Task Dependency Graph

```
Task 1 (Platform detection interface + tests)
  └─> Task 2 (Platform detection implementation)
        └─> Task 4 (IPC wiring)
              └─> Task 7 (UI — Install button)
                    └─> Task 8 (Integration test)
                          └─> Task 9 (E2E test)
                                └─> Task 10 (Manual verification)

Task 3 (Agent service — createInstallConversation)
  └─> Task 4 (IPC wiring)
  └─> Task 8 (Integration test)

Task 5 (Core install skills) ──────────────> Task 9 (E2E test)
Task 6 (Integration install skills) ───────> Task 9 (E2E test)
```

Tasks 1-2, 3, and 5-6 can run in parallel. Task 4 depends on 1-3. Task 7 depends on 4. Task 8 depends on 3+7. Task 9 depends on 5-8. Task 10 depends on everything.
