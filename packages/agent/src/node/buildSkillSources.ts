import type { SkillSource } from '../common/skillRegistry.js';

export interface InstalledPlugin {
  name: string;
  registry: string;
  version: string;
  enabled: boolean;
  cachePath: string;
}

export interface BuildSkillSourcesOptions {
  bundledPath: string;
  userPath?: string;
  additionalPaths?: string[];
  installedPlugins?: InstalledPlugin[];
  overridePath?: string;
}

export function buildSkillSources(options: BuildSkillSourcesOptions): SkillSource[] {
  if (options.overridePath) {
    return [{ id: 'override', priority: 0, basePath: options.overridePath }];
  }

  const sources: SkillSource[] = [
    { id: 'bundled', priority: 0, basePath: options.bundledPath },
  ];

  if (options.installedPlugins) {
    for (const plugin of options.installedPlugins) {
      if (plugin.enabled) {
        sources.push({
          id: `marketplace:${plugin.name}`,
          priority: 10,
          basePath: plugin.cachePath,
        });
      }
    }
  }

  if (options.additionalPaths) {
    for (let i = 0; i < options.additionalPaths.length; i++) {
      sources.push({
        id: `additional:${i}`,
        priority: 15,
        basePath: options.additionalPaths[i],
      });
    }
  }

  if (options.userPath) {
    sources.push({ id: 'user', priority: 20, basePath: options.userPath });
  }

  return sources;
}
