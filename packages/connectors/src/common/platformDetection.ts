import { createServiceIdentifier } from '@gho-work/base';
import type { PlatformContext } from '@gho-work/base';

// Re-export from @gho-work/base for convenience
export type { PlatformContext } from '@gho-work/base';

export interface IPlatformDetectionService {
	detect(): Promise<PlatformContext>;
}

export const IPlatformDetectionService = createServiceIdentifier<IPlatformDetectionService>('IPlatformDetectionService');
