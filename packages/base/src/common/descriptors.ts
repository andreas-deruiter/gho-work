/**
 * SyncDescriptor — wraps a constructor for lazy instantiation.
 * @see references/vscode/src/vs/platform/instantiation/common/descriptors.ts
 */
export class SyncDescriptor<T> {
  constructor(
    public readonly ctor: new (...args: any[]) => T,
    public readonly staticArguments: any[] = [],
    public readonly supportsDelayedInstantiation: boolean = false,
  ) {}
}
