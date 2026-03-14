import { describe, it, expect } from 'vitest';
import { expandPluginRoot } from '../common/pluginEnv';

describe('expandPluginRoot', () => {
  it('replaces ${CLAUDE_PLUGIN_ROOT} in strings', () => {
    expect(expandPluginRoot('${CLAUDE_PLUGIN_ROOT}/bin/lint', '/home/user/.plugins/sentry/1.0'))
      .toBe('/home/user/.plugins/sentry/1.0/bin/lint');
  });

  it('replaces multiple occurrences', () => {
    expect(expandPluginRoot('${CLAUDE_PLUGIN_ROOT}/a:${CLAUDE_PLUGIN_ROOT}/b', '/x'))
      .toBe('/x/a:/x/b');
  });

  it('returns string unchanged when no variable present', () => {
    expect(expandPluginRoot('plain-string', '/root'))
      .toBe('plain-string');
  });

  it('handles empty string', () => {
    expect(expandPluginRoot('', '/root')).toBe('');
  });
});
