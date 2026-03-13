// tests/integration/connectorSetup.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

const SKILLS_ROOT = path.resolve(__dirname, '../../skills');

describe('Connector Setup Skills', () => {
  describe('setup skill content', () => {
    it('setup skill file exists and contains required content', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      // Frontmatter
      expect(content).toContain('connector-setup');

      // Must reference the MCP Registry API
      expect(content).toContain('registry.modelcontextprotocol.io');
      expect(content).toContain('CONNECTOR_ADD');

      // Must cover all registry types
      expect(content).toContain('npm');
      expect(content).toContain('pypi');
      expect(content).toContain('docker');
      expect(content).toContain('streamable_http');
    });

    it('includes error handling guidance', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      expect(content).toContain('curl');
      expect(content).toMatch(/fallback|web search/i);
    });

    it('includes environment variable handling', async () => {
      const skillPath = path.join(SKILLS_ROOT, 'connectors', 'setup.md');
      const content = await fs.readFile(skillPath, 'utf-8');

      expect(content).toMatch(/environment/i);
    });
  });

  describe('CLI install skills', () => {
    const TOOL_IDS = ['gh', 'pandoc', 'git', 'mgc', 'az', 'gcloud', 'workiq'];

    for (const toolId of TOOL_IDS) {
      it(`install skill exists for ${toolId}`, async () => {
        const skillPath = path.join(SKILLS_ROOT, 'install', `${toolId}.md`);
        const exists = await fs.access(skillPath).then(() => true).catch(() => false);
        expect(exists, `Install skill missing for ${toolId}`).toBe(true);
      });
    }
  });

  describe('createSetupConversation behavior', () => {
    // Placeholder: will be implemented after Task 10 creates the method
    it.skip('placeholder: implement with real AgentServiceImpl mocks', () => {
      expect(true).toBe(true);
    });
  });
});
