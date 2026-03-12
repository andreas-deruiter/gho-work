import { Emitter, generateUUID } from '@gho-work/base';
import type { Event, ConnectorConfig } from '@gho-work/base';
import { Widget } from '../widget.js';

export interface ConnectorFormData {
  id: string;
  name: string;
  transport: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export class ConnectorConfigFormWidget extends Widget {
  private _config: ConnectorConfig | null;
  private _editing: boolean;
  private _transport: 'stdio' | 'streamable_http' = 'stdio';

  private readonly _onDidSave = this._register(new Emitter<ConnectorFormData>());
  readonly onDidSave: Event<ConnectorFormData> = this._onDidSave.event;
  private readonly _onDidCancel = this._register(new Emitter<void>());
  readonly onDidCancel: Event<void> = this._onDidCancel.event;
  private readonly _onDidDelete = this._register(new Emitter<string>());
  readonly onDidDelete: Event<string> = this._onDidDelete.event;

  constructor(config: ConnectorConfig | null) {
    const el = document.createElement('div');
    el.className = 'connector-config-form';
    super(el);
    this._config = config;
    this._editing = config === null;
    if (config) { this._transport = config.transport; }
    this._render();
  }

  private _render(): void {
    while (this.element.firstChild) { this.element.removeChild(this.element.firstChild); }
    if (this._config && !this._editing) { this._renderReadOnly(); }
    else { this._renderEdit(); }
  }

  private _renderReadOnly(): void {
    const c = this._config!;
    const fields = [
      ['Name', c.name],
      ['Transport', c.transport === 'stdio' ? 'stdio' : 'HTTP'],
      [c.transport === 'stdio' ? 'Command' : 'URL', (c.transport === 'stdio' ? c.command : c.url) ?? ''],
    ];
    for (const [label, value] of fields) {
      const row = document.createElement('div');
      row.className = 'config-field-readonly';
      const lbl = document.createElement('span');
      lbl.className = 'config-field-label';
      lbl.textContent = label;
      row.appendChild(lbl);
      const val = document.createElement('span');
      val.className = 'config-field-value';
      val.textContent = value;
      row.appendChild(val);
      this.element.appendChild(row);
    }
    const editBtn = document.createElement('button');
    editBtn.className = 'config-edit-btn';
    editBtn.textContent = 'Edit';
    this.listen(editBtn, 'click', () => { this._editing = true; this._render(); });
    this.element.appendChild(editBtn);
  }

  private _renderEdit(): void {
    const form = document.createElement('div');
    form.className = 'config-edit';

    // Name
    this._addLabel(form, 'Name');
    const nameInput = this._addInput(form, 'config-name-input', this._config?.name ?? '', 'Connector name');

    // Transport
    this._addLabel(form, 'Transport');
    const tGroup = document.createElement('div');
    tGroup.className = 'config-transport-group';
    for (const t of ['stdio', 'streamable_http'] as const) {
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'transport'; radio.value = t;
      radio.checked = this._transport === t;
      const label = document.createElement('label');
      label.textContent = t === 'stdio' ? ' stdio' : ' HTTP';
      label.prepend(radio);
      this.listen(radio, 'change', () => { this._transport = t; this._render(); });
      tGroup.appendChild(label);
    }
    form.appendChild(tGroup);

    // Transport fields
    if (this._transport === 'stdio') {
      this._addLabel(form, 'Command');
      this._addInput(form, 'config-command-input', this._config?.command ?? '', 'e.g. npx my-server');
      this._addLabel(form, 'Args (comma-separated)');
      this._addInput(form, 'config-args-input', this._config?.args?.join(', ') ?? '');
    } else {
      this._addLabel(form, 'URL');
      this._addInput(form, 'config-url-input', this._config?.url ?? '', 'https://example.com/mcp');
    }

    // Advanced
    const advToggle = document.createElement('button');
    advToggle.className = 'config-advanced-toggle';
    advToggle.textContent = 'Advanced \u25B6';
    const advSection = document.createElement('div');
    advSection.className = 'config-advanced';
    advSection.style.display = 'none';
    this.listen(advToggle, 'click', () => {
      const hidden = advSection.style.display === 'none';
      advSection.style.display = hidden ? '' : 'none';
      advToggle.textContent = hidden ? 'Advanced \u25BC' : 'Advanced \u25B6';
    });
    form.appendChild(advToggle);

    this._addLabel(advSection, 'Environment Variables (KEY=VALUE per line)');
    const envInput = document.createElement('textarea');
    envInput.className = 'config-env-input'; envInput.rows = 3;
    if (this._config?.env) { envInput.value = Object.entries(this._config.env).map(([k,v]) => `${k}=${v}`).join('\n'); }
    advSection.appendChild(envInput);

    if (this._transport === 'streamable_http') {
      this._addLabel(advSection, 'Headers (KEY: VALUE per line)');
      const hInput = document.createElement('textarea');
      hInput.className = 'config-headers-input'; hInput.rows = 3;
      if (this._config?.headers) { hInput.value = Object.entries(this._config.headers).map(([k,v]) => `${k}: ${v}`).join('\n'); }
      advSection.appendChild(hInput);
    }
    form.appendChild(advSection);

    // Buttons
    const btnGroup = document.createElement('div');
    btnGroup.className = 'config-btn-group';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'config-save-btn';
    saveBtn.textContent = this._config ? 'Save' : 'Add Connector';
    this.listen(saveBtn, 'click', () => this._handleSave());
    btnGroup.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'config-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    this.listen(cancelBtn, 'click', () => {
      if (this._config) { this._editing = false; this._render(); }
      this._onDidCancel.fire();
    });
    btnGroup.appendChild(cancelBtn);

    if (this._config) {
      const delBtn = document.createElement('button');
      delBtn.className = 'config-delete-btn';
      delBtn.textContent = 'Remove Connector';
      this.listen(delBtn, 'click', () => {
        if (confirm(`Remove connector "${this._config!.name}"? This cannot be undone.`)) {
          this._onDidDelete.fire(this._config!.id);
        }
      });
      btnGroup.appendChild(delBtn);
    }
    form.appendChild(btnGroup);
    this.element.appendChild(form);
  }

  private _handleSave(): void {
    const nameEl = this.element.querySelector('.config-name-input') as HTMLInputElement;
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }

    const data: ConnectorFormData = { id: this._config?.id ?? generateUUID(), name, transport: this._transport };

    if (this._transport === 'stdio') {
      const cmdEl = this.element.querySelector('.config-command-input') as HTMLInputElement;
      data.command = cmdEl?.value.trim();
      if (!data.command) { cmdEl?.focus(); return; }
      const argsVal = (this.element.querySelector('.config-args-input') as HTMLInputElement)?.value.trim();
      if (argsVal) { data.args = argsVal.split(',').map(s => s.trim()).filter(Boolean); }
    } else {
      const urlEl = this.element.querySelector('.config-url-input') as HTMLInputElement;
      data.url = urlEl?.value.trim();
      if (!data.url) { urlEl?.focus(); return; }
    }

    const envVal = (this.element.querySelector('.config-env-input') as HTMLTextAreaElement)?.value.trim();
    if (envVal) {
      data.env = {};
      for (const line of envVal.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) { data.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim(); }
      }
    }

    const headersVal = (this.element.querySelector('.config-headers-input') as HTMLTextAreaElement)?.value.trim();
    if (headersVal) {
      data.headers = {};
      for (const line of headersVal.split('\n')) {
        const colon = line.indexOf(':');
        if (colon > 0) { data.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
      }
    }

    this._onDidSave.fire(data);
  }

  private _addLabel(parent: HTMLElement, text: string): void {
    const label = document.createElement('label');
    label.className = 'config-label';
    label.textContent = text;
    parent.appendChild(label);
  }

  private _addInput(parent: HTMLElement, cls: string, value: string, placeholder?: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text'; input.className = cls; input.value = value;
    if (placeholder) { input.placeholder = placeholder; }
    parent.appendChild(input);
    return input;
  }
}
