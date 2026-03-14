/**
 * Expand ${CLAUDE_PLUGIN_ROOT} variable in plugin configuration strings.
 */
export function expandPluginRoot(value: string, pluginRoot: string): string {
  return value.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
}

/**
 * Expand ${CLAUDE_PLUGIN_ROOT} in all string values of a Record.
 */
export function expandPluginRootInRecord(
  record: Record<string, string>,
  pluginRoot: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = expandPluginRoot(value, pluginRoot);
  }
  return result;
}
