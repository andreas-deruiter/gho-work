import { createServiceIdentifier } from '@gho-work/base';
import type { IDisposable, Event } from '@gho-work/base';

export interface CLIToolStatus {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  authenticated?: boolean;
  installUrl: string;
  authCommand?: string;
}

export interface ICLIDetectionService extends IDisposable {
  detectAll(): Promise<CLIToolStatus[]>;
  detect(toolId: string): Promise<CLIToolStatus | undefined>;
  refresh(): Promise<void>;
  installTool(toolId: string): Promise<{ success: boolean; installUrl?: string; error?: string }>;
  authenticateTool(toolId: string): Promise<{ success: boolean; error?: string }>;

  readonly onDidChangeTools: Event<CLIToolStatus[]>;
}

export const ICLIDetectionService = createServiceIdentifier<ICLIDetectionService>('ICLIDetectionService');
