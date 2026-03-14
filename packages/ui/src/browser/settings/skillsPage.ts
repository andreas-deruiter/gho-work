import type { IIPCRenderer } from '@gho-work/platform/common';
import { IPC_CHANNELS } from '@gho-work/platform/common';
import type { SkillEntryDTO, SkillSourceDTO } from '@gho-work/platform/common';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

export class SkillsPage extends Widget {
  private readonly _sourceListEl: HTMLElement;
  private readonly _skillListEl: HTMLElement;
  private readonly _inputEl: HTMLInputElement;
  private readonly _addBtn: HTMLButtonElement;
  private readonly _errorEl: HTMLElement;
  private _disclaimerShown = false;

  constructor(private readonly _ipc: IIPCRenderer) {
    const layout = h('div.settings-page-skills', [
      h('h2.settings-page-title@title'),
      h('p.settings-page-subtitle@subtitle'),
      h('div.settings-section@sourcesSection'),
      h('div.settings-section@skillsSection'),
    ]);
    super(layout.root);

    layout.title.textContent = 'Skills';
    layout.subtitle.textContent = 'Manage agent skills and skill source directories';

    // --- Skill Sources section ---
    const sourcesTitle = document.createElement('div');
    sourcesTitle.className = 'settings-section-title';
    sourcesTitle.textContent = 'Skill Sources';
    layout.sourcesSection.appendChild(sourcesTitle);

    const sourcesSubtitle = document.createElement('div');
    sourcesSubtitle.className = 'settings-section-subtitle';
    sourcesSubtitle.textContent = 'Directories where skills are loaded from';
    layout.sourcesSection.appendChild(sourcesSubtitle);

    this._sourceListEl = document.createElement('div');
    this._sourceListEl.className = 'skill-source-list';
    this._sourceListEl.setAttribute('role', 'list');
    layout.sourcesSection.appendChild(this._sourceListEl);

    const inputRow = document.createElement('div');
    inputRow.className = 'skill-path-input-row';

    this._inputEl = document.createElement('input');
    this._inputEl.type = 'text';
    this._inputEl.className = 'skill-path-input';
    this._inputEl.placeholder = 'Enter path or use Browse...';
    this._inputEl.setAttribute('aria-label', 'Additional skill path');
    this.listen(this._inputEl, 'input', () => this._updateAddButtonState());
    inputRow.appendChild(this._inputEl);

    const browseBtn = document.createElement('button');
    browseBtn.className = 'skill-path-browse-btn';
    browseBtn.textContent = 'Browse';
    browseBtn.setAttribute('aria-label', 'Browse for skill directory');
    this.listen(browseBtn, 'click', () => void this._browsePath());
    inputRow.appendChild(browseBtn);

    this._addBtn = document.createElement('button');
    this._addBtn.className = 'skill-path-add-btn';
    this._addBtn.textContent = 'Add';
    this._addBtn.disabled = true;
    this.listen(this._addBtn, 'click', () => void this._addPath());
    inputRow.appendChild(this._addBtn);

    layout.sourcesSection.appendChild(inputRow);

    this._errorEl = document.createElement('div');
    this._errorEl.className = 'skill-path-input-error';
    this._errorEl.style.display = 'none';
    layout.sourcesSection.appendChild(this._errorEl);

    // --- Installed Skills section ---
    const skillsHeader = document.createElement('div');
    skillsHeader.className = 'settings-section-header';

    const skillsTitle = document.createElement('div');
    skillsTitle.className = 'settings-section-title';
    skillsTitle.textContent = 'Installed Skills';
    skillsHeader.appendChild(skillsTitle);

    const rescanBtn = document.createElement('button');
    rescanBtn.className = 'skill-rescan-btn';
    rescanBtn.textContent = '\u21bb Rescan';
    rescanBtn.setAttribute('aria-label', 'Rescan skill directories');
    this.listen(rescanBtn, 'click', () => void this._rescan());
    skillsHeader.appendChild(rescanBtn);

    layout.skillsSection.appendChild(skillsHeader);

    this._skillListEl = document.createElement('div');
    this._skillListEl.className = 'skill-list-container';
    layout.skillsSection.appendChild(this._skillListEl);

    // Listen for skill changes from main process
    const onSkillChanged = (...args: unknown[]) => {
      const skills = args[0] as SkillEntryDTO[];
      this._renderSkills(skills);
    };
    this._ipc.on(IPC_CHANNELS.SKILL_CHANGED, onSkillChanged);
    this._register({ dispose: () => this._ipc.removeListener(IPC_CHANNELS.SKILL_CHANGED, onSkillChanged) });
  }

  async load(): Promise<void> {
    try {
      const [sources, skills] = await Promise.all([
        this._ipc.invoke<SkillSourceDTO[]>(IPC_CHANNELS.SKILL_SOURCES),
        this._ipc.invoke<SkillEntryDTO[]>(IPC_CHANNELS.SKILL_LIST),
      ]);
      this._renderSources(sources);
      this._renderSkills(skills);
    } catch (err) {
      console.error('[SkillsPage] Failed to load skill data:', err);
    }
  }

  private _renderSources(sources: SkillSourceDTO[]): void {
    while (this._sourceListEl.firstChild) {
      this._sourceListEl.removeChild(this._sourceListEl.firstChild);
    }

    for (const source of sources) {
      const item = document.createElement('div');
      item.className = 'skill-source-item';
      item.setAttribute('role', 'listitem');

      const info = document.createElement('div');
      info.className = 'skill-source-info';

      const pathEl = document.createElement('div');
      pathEl.className = 'skill-source-path';
      pathEl.textContent = source.basePath;
      info.appendChild(pathEl);

      const descEl = document.createElement('div');
      descEl.className = 'skill-source-desc';
      descEl.textContent = source.priority <= 0 ? 'Built-in (bundled with app)' : 'User skills directory';
      info.appendChild(descEl);

      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'skill-source-actions';

      const badge = document.createElement('span');
      badge.className = source.priority <= 0 ? 'skill-source-badge default' : 'skill-source-badge user';
      badge.textContent = source.priority <= 0 ? 'default' : 'user';
      actions.appendChild(badge);

      if (source.priority > 0) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'skill-source-remove';
        removeBtn.textContent = '\u00d7';
        removeBtn.setAttribute('aria-label', `Remove path: ${source.basePath}`);
        this.listen(removeBtn, 'click', () => void this._removePath(source.basePath));
        actions.appendChild(removeBtn);
      }

      item.appendChild(actions);
      this._sourceListEl.appendChild(item);
    }
  }

  private _renderSkills(skills: SkillEntryDTO[]): void {
    while (this._skillListEl.firstChild) {
      this._skillListEl.removeChild(this._skillListEl.firstChild);
    }

    if (skills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-empty-state';
      empty.textContent = 'No skills found. Add a skill source directory above.';
      this._skillListEl.appendChild(empty);
      return;
    }

    const grouped = new Map<string, SkillEntryDTO[]>();
    for (const skill of skills) {
      const group = grouped.get(skill.category) ?? [];
      group.push(skill);
      grouped.set(skill.category, group);
    }

    for (const [category, entries] of grouped) {
      const catHeader = document.createElement('div');
      catHeader.className = 'skill-category';
      catHeader.setAttribute('role', 'heading');
      catHeader.setAttribute('aria-level', '3');
      catHeader.textContent = category;
      this._skillListEl.appendChild(catHeader);

      const groupEl = document.createElement('div');
      groupEl.className = 'skill-list-group';

      for (const entry of entries) {
        const isDisabled = entry.disabled === true;
        const item = document.createElement('div');
        item.className = 'skill-item' + (isDisabled ? ' disabled' : '');

        const entryInfo = document.createElement('div');
        entryInfo.className = 'skill-item-info';

        const name = document.createElement('div');
        name.className = 'skill-item-name';
        name.textContent = entry.name;
        entryInfo.appendChild(name);

        const desc = document.createElement('div');
        desc.className = 'skill-item-desc';
        desc.textContent = entry.description;
        entryInfo.appendChild(desc);

        item.appendChild(entryInfo);

        const actions = document.createElement('div');
        actions.className = 'skill-item-actions';

        const source = document.createElement('div');
        source.className = 'skill-item-source';
        source.textContent = entry.sourceId;
        actions.appendChild(source);

        // Toggle switch
        const toggle = document.createElement('div');
        toggle.className = 'skill-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(!isDisabled));
        toggle.setAttribute('aria-label', `Enable ${entry.name}`);
        toggle.setAttribute('tabindex', '0');

        const knob = document.createElement('div');
        knob.className = 'skill-toggle-knob';
        toggle.appendChild(knob);

        const handleToggle = () => {
          const currentlyEnabled = toggle.getAttribute('aria-checked') === 'true';
          void this._toggleSkill(entry.id, !currentlyEnabled);
        };
        this.listen(toggle, 'click', handleToggle);
        this.listen(toggle, 'keydown', (e: Event) => {
          const ke = e as KeyboardEvent;
          if (ke.key === 'Enter' || ke.key === ' ') {
            ke.preventDefault();
            handleToggle();
          }
        });

        actions.appendChild(toggle);
        item.appendChild(actions);
        groupEl.appendChild(item);
      }

      this._skillListEl.appendChild(groupEl);
    }
  }

  private async _toggleSkill(skillId: string, enabled: boolean): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.SKILL_TOGGLE, { skillId, enabled });
      if (!this._disclaimerShown) {
        this._disclaimerShown = true;
        this._showDisclaimer();
      }
    } catch (err) {
      console.error('[SkillsPage] Failed to toggle skill:', err);
    }
  }

  private _showDisclaimer(): void {
    const existing = this.getDomNode().querySelector('.skill-toggle-disclaimer');
    if (existing) { return; }
    const disclaimer = document.createElement('div');
    disclaimer.className = 'skill-toggle-disclaimer';
    disclaimer.textContent = 'Changes apply to new conversations. Existing conversations keep their current settings.';
    // Insert before the skill list container
    this._skillListEl.parentElement?.insertBefore(disclaimer, this._skillListEl);
  }

  private _updateAddButtonState(): void {
    this._addBtn.disabled = this._inputEl.value.trim().length === 0;
  }

  private async _browsePath(): Promise<void> {
    try {
      const result = await this._ipc.invoke<{ canceled?: boolean; path?: string }>(
        IPC_CHANNELS.DIALOG_OPEN_FOLDER,
      );
      if (!result.canceled && result.path) {
        this._inputEl.value = result.path;
        this._updateAddButtonState();
      }
    } catch (err) {
      console.error('[SkillsPage] Failed to open folder dialog:', err);
    }
  }

  private async _addPath(): Promise<void> {
    const pathValue = this._inputEl.value.trim();
    if (!pathValue) { return; }

    this._errorEl.style.display = 'none';

    try {
      const result = await this._ipc.invoke<{ ok?: true; error?: string }>(
        IPC_CHANNELS.SKILL_ADD_PATH,
        { path: pathValue },
      );

      if ('error' in result && result.error) {
        this._errorEl.textContent = result.error;
        this._errorEl.style.display = '';
        return;
      }

      this._inputEl.value = '';
      this._updateAddButtonState();
      await this.load();
    } catch (err) {
      this._errorEl.textContent = 'Failed to add path';
      this._errorEl.style.display = '';
      console.error('[SkillsPage] Failed to add path:', err);
    }
  }

  private async _removePath(pathToRemove: string): Promise<void> {
    try {
      await this._ipc.invoke(IPC_CHANNELS.SKILL_REMOVE_PATH, { path: pathToRemove });
      await this.load();
    } catch (err) {
      console.error('[SkillsPage] Failed to remove path:', err);
    }
  }

  private async _rescan(): Promise<void> {
    try {
      const skills = await this._ipc.invoke<SkillEntryDTO[]>(IPC_CHANNELS.SKILL_RESCAN);
      this._renderSkills(skills);
    } catch (err) {
      console.error('[SkillsPage] Failed to rescan:', err);
    }
  }
}
