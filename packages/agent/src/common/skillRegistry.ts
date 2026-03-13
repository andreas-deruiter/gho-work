import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event } from '@gho-work/base';

export interface SkillSource {
  id: string;
  priority: number;
  basePath: string;
}

export interface SkillEntry {
  id: string;
  category: string;
  name: string;
  description: string;
  sourceId: string;
  filePath: string;
}

export interface ISkillRegistry extends IDisposable {
  scan(): Promise<void>;
  getSkill(category: string, name: string): Promise<string | undefined>;
  getEntry(category: string, name: string): SkillEntry | undefined;
  list(category?: string): SkillEntry[];
  refresh(): Promise<void>;
  readonly onDidChangeSkills: Event<SkillEntry[]>;
}

export const ISkillRegistry = createServiceIdentifier<ISkillRegistry>('ISkillRegistry');
