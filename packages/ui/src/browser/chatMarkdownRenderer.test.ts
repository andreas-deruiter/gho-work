import { describe, test, expect, beforeEach } from 'vitest';
// vitest.config.ts sets environment: 'jsdom' — no manual DOM setup needed
import { renderChatMarkdown } from './chatMarkdownRenderer.js';

describe('renderChatMarkdown', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  test('renders paragraphs', () => {
    renderChatMarkdown(container, 'Hello world');
    expect(container.querySelector('p')?.textContent).toBe('Hello world');
  });

  test('renders bold text', () => {
    renderChatMarkdown(container, '**bold**');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  test('renders inline code', () => {
    renderChatMarkdown(container, 'Use `const x = 1`');
    expect(container.querySelector('code')?.textContent).toBe('const x = 1');
  });

  test('renders code blocks with language class', () => {
    renderChatMarkdown(container, '```typescript\nconst x = 1;\n```');
    const pre = container.querySelector('pre');
    const code = pre?.querySelector('code');
    expect(pre).toBeTruthy();
    expect(code).toBeTruthy();
    expect(code?.className).toContain('language-typescript');
  });

  test('renders unordered lists', () => {
    renderChatMarkdown(container, '- item 1\n- item 2');
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(2);
  });

  test('renders tables', () => {
    renderChatMarkdown(container, '| A | B |\n|---|---|\n| 1 | 2 |');
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('td').length).toBe(2);
  });

  test('renders blockquotes', () => {
    renderChatMarkdown(container, '> quoted text');
    expect(container.querySelector('blockquote')).toBeTruthy();
  });

  test('renders links', () => {
    renderChatMarkdown(container, '[click](https://example.com)');
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('click');
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  test('sanitizes script tags', () => {
    renderChatMarkdown(container, '<script>alert("xss")</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).not.toContain('alert');
  });

  test('sanitizes dangerous href protocols', () => {
    renderChatMarkdown(container, '[click](javascript:alert(1))');
    const link = container.querySelector('a');
    if (link) {
      // DOMPurify either strips the href entirely (null) or rewrites it — neither should contain 'javascript'
      const href = link.getAttribute('href');
      if (href !== null) {
        expect(href).not.toContain('javascript');
      }
      // href being null is also acceptable — means DOMPurify removed the dangerous attribute
    }
  });

  test('renders headings', () => {
    renderChatMarkdown(container, '## Heading 2');
    const h2 = container.querySelector('h2');
    expect(h2?.textContent).toBe('Heading 2');
  });

  test('renders horizontal rules', () => {
    renderChatMarkdown(container, 'above\n\n---\n\nbelow');
    expect(container.querySelector('hr')).toBeTruthy();
  });

  test('handles streaming mode with fillInIncompleteTokens', () => {
    renderChatMarkdown(container, 'Hello **world', { isStreaming: true });
    const html = container.textContent ?? '';
    expect(html).toContain('world');
  });

  test('handles incomplete code fence in streaming', () => {
    renderChatMarkdown(container, '```typescript\nconst x = 1;', { isStreaming: true });
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
  });

  test('handles incomplete table in streaming', () => {
    renderChatMarkdown(container, '| A | B |\n| --', { isStreaming: true });
    const content = container.textContent ?? '';
    expect(content).toBeTruthy();
  });
});
