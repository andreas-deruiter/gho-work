/**
 * Welcome step — logo, tagline, feature bullets, "Get Started" button.
 */
import { Emitter } from '@gho-work/base';
import { Widget } from '../widget.js';
import { h } from '../dom.js';

function createSvgIcon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  return svg;
}

export class WelcomeStep extends Widget {
  private readonly _onDidClickStart = this._register(new Emitter<void>());
  readonly onDidClickStart = this._onDidClickStart.event;

  constructor(container: HTMLElement) {
    super(container);
    this._render();
  }

  private _render(): void {
    const dom = h('.onboarding-welcome', [
      h('.onb-welcome-content', [
        h('.onb-logo', [
          h('.onb-logo-mark@logoMark'),
        ]),
        h('h2@heading'),
        h('p.onb-tagline@tagline'),
        h('.onb-features', [
          h('.onb-feature', [
            h('.onb-feature-icon@chatIcon'),
            h('span@chatText'),
          ]),
          h('.onb-feature', [
            h('.onb-feature-icon@shieldIcon'),
            h('span@shieldText'),
          ]),
          h('.onb-feature', [
            h('.onb-feature-icon@connectIcon'),
            h('span@connectText'),
          ]),
        ]),
        h('button.btn-primary.btn-large@startBtn'),
        h('p.onb-footnote@footnote'),
      ]),
    ]);

    dom.logoMark.textContent = 'G';
    dom.heading.textContent = 'Welcome to GHO Work';
    dom.tagline.textContent = 'Your AI-powered office assistant, running locally on your machine.';

    dom.chatIcon.appendChild(createSvgIcon('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'));
    dom.chatText.textContent = 'Chat with an AI agent that can take real actions';

    dom.shieldIcon.appendChild(createSvgIcon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'));
    dom.shieldText.textContent = 'You approve every action before it executes';

    dom.connectIcon.appendChild(createSvgIcon('M12 1v6m0 6v6m-7-7h6m6 0h6'));
    dom.connectText.textContent = 'Connect to Google, Microsoft, Slack, and more via MCP';

    dom.startBtn.textContent = 'Sign in with GitHub';
    this.listen(dom.startBtn, 'click', () => this._onDidClickStart.fire());

    dom.footnote.textContent = 'Requires a GitHub account with Copilot subscription (Free tier works)';

    this.element.appendChild(dom.root);
  }
}
