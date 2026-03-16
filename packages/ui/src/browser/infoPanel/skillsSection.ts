import { CollapsibleSection } from './collapsibleSection.js';
import { h } from '../dom.js';

type SkillState = 'running' | 'completed' | 'failed';

interface SkillEntry {
  name: string;
  state: SkillState;
  el: HTMLElement;
  dotEl: HTMLElement;
  statusEl: HTMLElement;
}

export class SkillsSection extends CollapsibleSection {
  private readonly _skills = new Map<string, SkillEntry>();

  constructor() {
    super('Skills', { defaultCollapsed: true });
    this.setVisible(false);
  }

  updateSkill(skillName: string, state: SkillState): void {
    let entry = this._skills.get(skillName);

    if (!entry) {
      const layout = h('div.info-skill-row@root', [
        h('span.info-skill-dot@dot'),
        h('span.info-skill-name@name'),
        h('span.info-skill-status@status'),
      ]);
      layout['name'].textContent = skillName;
      layout.root.setAttribute('data-skill', skillName);

      entry = { name: skillName, state, el: layout.root, dotEl: layout['dot'], statusEl: layout['status'] };
      this._skills.set(skillName, entry);
      this.bodyElement.appendChild(layout.root);
      this.setVisible(true);
    }

    entry.state = state;
    entry.dotEl.className = `info-skill-dot info-skill-dot--${state}`;
    entry.statusEl.className = `info-skill-status info-skill-status--${state}`;
    entry.statusEl.textContent = state === 'running' ? 'ACTIVE' : state === 'completed' ? 'DONE' : 'FAILED';

    this._updateBadge();
  }

  setSkills(skills: Array<{ name: string; state: SkillState }>): void {
    this._skills.clear();
    this.bodyElement.textContent = '';
    for (const s of skills) {
      this.updateSkill(s.name, s.state);
    }
    this.setVisible(skills.length > 0);
  }

  getSkillEntries(): Array<{ name: string; state: SkillState }> {
    return [...this._skills.values()].map(s => ({ name: s.name, state: s.state }));
  }

  private _updateBadge(): void {
    const active = [...this._skills.values()].filter(s => s.state === 'running').length;
    this.setBadge(active > 0 ? `${active} active` : '');
  }
}
