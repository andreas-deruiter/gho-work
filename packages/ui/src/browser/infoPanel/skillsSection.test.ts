import { describe, it, expect } from 'vitest';
import { SkillsSection } from './skillsSection.js';

describe('SkillsSection', () => {
  it('starts hidden', () => {
    const section = new SkillsSection();
    expect(section.getDomNode().style.display).toBe('none');
  });

  it('shows when skill invoked', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    expect(section.getDomNode().style.display).not.toBe('none');
  });

  it('shows active badge', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 active');
  });

  it('updates skill to completed', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    section.updateSkill('brainstorming', 'completed');
    const status = section.getDomNode().querySelector('[data-skill="brainstorming"] .info-skill-status');
    expect(status?.textContent).toBe('DONE');
  });

  it('tracks multiple skills', () => {
    const section = new SkillsSection();
    section.updateSkill('brainstorming', 'running');
    section.updateSkill('debugging', 'running');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('2 active');
    section.updateSkill('brainstorming', 'completed');
    expect(section.getDomNode().querySelector('.info-section-badge')?.textContent).toBe('1 active');
  });
});
