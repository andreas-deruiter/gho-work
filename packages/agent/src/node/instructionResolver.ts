/**
 * InstructionResolver — discovers, reads, and merges user/project instruction files
 * into a single string for the agent's system message.
 *
 * Discovery order within each directory:
 *   GHO.md → CLAUDE.md → .github/copilot-instructions.md → .cursorrules
 *
 * User-level files come first, then project-level files.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** Maximum size per instruction file (50 KB). */
const MAX_FILE_SIZE = 50 * 1024;

/** File names to look for, in priority order within each directory. */
const INSTRUCTION_FILES: Array<{ name: string; subdir?: string; format: string }> = [
  { name: 'GHO.md', format: 'gho' },
  { name: 'CLAUDE.md', format: 'claude' },
  { name: 'copilot-instructions.md', subdir: '.github', format: 'copilot' },
  { name: '.cursorrules', format: 'cursor' },
];

export interface InstructionSource {
  path: string;
  origin: 'user' | 'project';
  format: string;
}

export interface InstructionResult {
  /** Merged content ready for systemMessage. */
  content: string;
  /** Which files were loaded (for transparency). */
  sources: InstructionSource[];
}

export class InstructionResolver {
  constructor(
    private readonly _userDir: string,
    private readonly _projectDirs: string[],
  ) {}

  async resolve(): Promise<InstructionResult> {
    const sources: InstructionSource[] = [];
    const sections: string[] = [];

    // 1. User-level instructions
    await this._scanDir(this._userDir, 'user', sources, sections);

    // 2. Project-level instructions (each dir in order)
    for (const dir of this._projectDirs) {
      await this._scanDir(dir, 'project', sources, sections);
    }

    return {
      content: sections.join('\n\n'),
      sources,
    };
  }

  private async _scanDir(
    dir: string,
    origin: 'user' | 'project',
    sources: InstructionSource[],
    sections: string[],
  ): Promise<void> {
    for (const entry of INSTRUCTION_FILES) {
      const filePath = entry.subdir
        ? path.join(dir, entry.subdir, entry.name)
        : path.join(dir, entry.name);

      const content = await this._readFile(filePath);
      if (content !== null) {
        sources.push({ path: filePath, origin, format: entry.format });
        const label = origin === 'user'
          ? `User instructions from ${filePath}`
          : `Project instructions from ${filePath}`;
        sections.push(`<!-- ${label} -->\n${content}`);
      }
    }
  }

  /**
   * Reads a file, returns its content or null if it doesn't exist.
   * Truncates files larger than MAX_FILE_SIZE.
   */
  private async _readFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, { encoding: 'utf-8' });
      if (content.length > MAX_FILE_SIZE) {
        console.warn(`[InstructionResolver] File exceeds 50KB (${content.length} bytes), truncating: ${filePath}`);
        return content.slice(0, MAX_FILE_SIZE) + '\n\n[Instructions truncated — file exceeds 50KB]';
      }
      return content;
    } catch {
      return null;
    }
  }
}
