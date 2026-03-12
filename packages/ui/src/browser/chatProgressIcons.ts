/** Maps tool name patterns to icon class names. */
export function getToolIconClass(toolName: string): string {
  const name = toolName.toLowerCase();

  if (/search|grep|find|semantic|codebase|list/.test(name)) {
    return 'icon-search';
  }
  if (/read|get_file|problems|diagnostics/.test(name)) {
    return 'icon-file';
  }
  if (/edit|create|replace|write|patch|insert/.test(name)) {
    return 'icon-pencil';
  }
  if (/terminal|exec|run|shell|bash/.test(name)) {
    return 'icon-terminal';
  }
  if (/fetch|http|url|web/.test(name)) {
    return 'icon-globe';
  }
  return 'icon-tool';
}

/** Returns past-tense message for a tool call. */
export function getPastTenseMessage(toolName: string, status: string): string {
  if (status === 'failed') {
    return `Failed: ${toolName}`;
  }
  if (status === 'cancelled') {
    return `Cancelled: ${toolName}`;
  }
  return `Used ${toolName}`;
}

/** Returns in-progress message for a tool call. */
export function getInProgressMessage(toolName: string): string {
  return `Using ${toolName}...`;
}
