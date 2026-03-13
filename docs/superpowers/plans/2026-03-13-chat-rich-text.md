# Chat Rich Text Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rich markdown rendering to chat messages — headings, tables, code blocks with syntax highlighting, lists, blockquotes, links — matching VS Code's chat rendering quality.

**Architecture:** Extract markdown rendering from `chatPanel.ts` into a dedicated `chatMarkdownRenderer.ts` utility. Add CSS styling for all markdown elements. Add `highlight.js` for code syntax highlighting (lighter than Monaco). Port VS Code's `fillInIncompleteTokens()` for streaming markdown stability.

**Tech Stack:** marked (already installed), DOMPurify (already installed), highlight.js (new), CSS custom properties (existing theme system)

**Bundling note:** `highlight.js` is a pure JavaScript library used only in the renderer process. It will be bundled by electron-vite into the renderer bundle (no externalization needed in `electron.vite.config.ts`). It has no native dependencies.

**Parallelism:** Tasks 1 and 3 (CSS-only) are independent of each other. Task 2 (TypeScript) is independent of Tasks 1/3. Task 4 (E2E) depends on all prior tasks. Task 5 (HARD GATE) depends on all prior tasks.

---

## Chunk 1: CSS Styling for Markdown Elements

### Task 1: Add comprehensive markdown CSS

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css:360-376` (existing `.chat-message-content code` rules)

This task adds CSS rules for all markdown elements rendered inside `.chat-message-content`. Adapted from VS Code's `markdown.css` (MIT) but using our existing CSS custom properties.

- [ ] **Step 1: Add markdown element styles to styles.css**

Replace the existing `.chat-message-content code` and `.chat-message-content strong` blocks (lines 365-376) and add comprehensive styling for all markdown elements. Insert these rules after `.chat-message-content` (line 363):

```css
/* — Markdown element styling inside chat messages — */

.chat-message-content p {
  margin-bottom: 12px;
}

.chat-message-content p:last-child {
  margin-bottom: 0;
}

/* Headings */
.chat-message-content h1,
.chat-message-content h2,
.chat-message-content h3,
.chat-message-content h4,
.chat-message-content h5,
.chat-message-content h6 {
  font-weight: 600;
  margin-top: 16px;
  margin-bottom: 8px;
  line-height: 1.25;
  color: var(--fg-primary);
}

.chat-message-content h1:first-child,
.chat-message-content h2:first-child,
.chat-message-content h3:first-child {
  margin-top: 0;
}

.chat-message-content h1 { font-size: 1.5em; }
.chat-message-content h2 { font-size: 1.3em; }
.chat-message-content h3 { font-size: 1.1em; }
.chat-message-content h4 { font-size: 1em; }
.chat-message-content h5 { font-size: 0.9em; }
.chat-message-content h6 { font-size: 0.85em; }

/* Bold / emphasis */
.chat-message-content strong {
  color: var(--fg-primary);
  font-weight: 600;
}

.chat-message-content em {
  font-style: italic;
}

/* Inline code */
.chat-message-content code {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
}

/* Code blocks */
.chat-message-content pre {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin: 8px 0;
  overflow-x: auto;
}

.chat-message-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: var(--font-size-sm);
  line-height: 1.5;
  tab-size: 4;
  display: block;
  color: var(--fg-primary);
}

/* Lists */
.chat-message-content ul,
.chat-message-content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.chat-message-content li {
  margin-bottom: 4px;
}

.chat-message-content li p {
  margin-bottom: 4px;
}

.chat-message-content ul ul,
.chat-message-content ul ol,
.chat-message-content ol ul,
.chat-message-content ol ol {
  margin-top: 4px;
  margin-bottom: 0;
}

/* Blockquotes */
.chat-message-content blockquote {
  margin: 8px 0;
  padding: 4px 16px;
  border-left: 3px solid var(--fg-accent);
  color: var(--fg-secondary);
  background: transparent;
}

.chat-message-content blockquote p:last-child {
  margin-bottom: 0;
}

/* Tables */
.chat-message-content table {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
  overflow-x: auto;
  display: block;
}

.chat-message-content th {
  text-align: left;
  font-weight: 600;
  color: var(--fg-primary);
  border-bottom: 2px solid var(--border-primary);
  padding: 6px 12px;
}

.chat-message-content td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.chat-message-content tr:last-child td {
  border-bottom: none;
}

/* Horizontal rule */
.chat-message-content hr {
  border: 0;
  height: 1px;
  background: var(--border-primary);
  margin: 16px 0;
}

/* Links */
.chat-message-content a {
  color: var(--fg-accent);
  text-decoration: none;
}

.chat-message-content a:hover {
  text-decoration: underline;
}

/* Images */
.chat-message-content img {
  max-width: 100%;
  border-radius: var(--radius-sm);
}

/* Strikethrough */
.chat-message-content del {
  text-decoration: line-through;
  color: var(--fg-muted);
}

/* Sub/sup line height fix (from VS Code) */
.chat-message-content sub,
.chat-message-content sup {
  line-height: 0;
}
```

- [ ] **Step 2: Verify existing styles don't conflict**

Run: `npx turbo build`
Expected: Clean compilation. The old `.chat-message-content strong` and `.chat-message-content code` rules need to be removed when adding the new ones (they're replaced by the comprehensive rules above).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat: add comprehensive markdown CSS for chat messages

Adapted from VS Code's markdown.css (MIT). Covers headings, lists,
tables, blockquotes, code blocks, links, and inline formatting.
Uses existing CSS custom properties for theming."
```

---

## Chunk 2: Syntax Highlighting with highlight.js

### Task 2: Install highlight.js and integrate with marked

**Files:**
- Modify: `packages/ui/package.json` (add highlight.js dependency)
- Create: `packages/ui/src/browser/chatMarkdownRenderer.ts` (extracted + enhanced renderer)
- Modify: `packages/ui/src/browser/chatPanel.ts` (use new renderer)
- Create: `packages/ui/src/browser/chatMarkdownRenderer.test.ts` (tests)

- [ ] **Step 1: Write tests for the markdown renderer**

Create `packages/ui/src/browser/chatMarkdownRenderer.test.ts`:

```typescript
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
    // highlight.js adds language-* class
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
    // DOMPurify removes dangerous protocols
    if (link) {
      expect(link.getAttribute('href')).not.toContain('javascript');
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
    // Incomplete bold should still render
    renderChatMarkdown(container, 'Hello **world', { isStreaming: true });
    // Should not show raw ** in output
    const html = container.textContent ?? '';
    expect(html).toContain('world');
  });

  test('handles incomplete code fence in streaming', () => {
    renderChatMarkdown(container, '```typescript\nconst x = 1;', { isStreaming: true });
    // Should render as a code block even though fence is not closed
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
  });

  test('handles incomplete table in streaming', () => {
    renderChatMarkdown(container, '| A | B |\n| --', { isStreaming: true });
    // Should attempt to complete the table
    const content = container.textContent ?? '';
    expect(content).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/ui/src/browser/chatMarkdownRenderer.test.ts`
Expected: FAIL — `chatMarkdownRenderer.ts` does not exist yet.

- [ ] **Step 3: Install highlight.js**

```bash
cd packages/ui && npm install highlight.js@^11.11.0
```

highlight.js is a lightweight syntax highlighter (~34KB core + per-language grammars). It's the standard choice for markdown code block highlighting outside of editor contexts. VS Code uses Monaco for this, but Monaco is far heavier and we don't need editor features in chat messages.

- [ ] **Step 4: Create the markdown renderer**

Create `packages/ui/src/browser/chatMarkdownRenderer.ts`:

```typescript
/**
 * Chat markdown renderer — renders markdown strings to DOM elements.
 *
 * Uses marked for parsing, highlight.js for code syntax highlighting,
 * and DOMPurify for XSS prevention. Includes streaming support via
 * fillInIncompleteTokens (ported from VS Code, MIT license).
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';

// Register common languages — import only what we need for bundle size.
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import csharp from 'highlight.js/lib/languages/csharp';
import java from 'highlight.js/lib/languages/java';
import powershell from 'highlight.js/lib/languages/powershell';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('java', java);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('txt', plaintext);

// ─── Marked configuration ───

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }: marked.Tokens.Code): string {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  let highlighted: string;
  try {
    highlighted = hljs.highlight(text, { language }).value;
  } catch {
    highlighted = escapeHtml(text);
  }
  return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>`;
};

const markedInstance = new marked.Marked({ renderer, breaks: true, gfm: true });

// ─── Sanitization config ───
// Allowed tags from VS Code's chatContentMarkdownRenderer (MIT).
const ALLOWED_TAGS = [
  'b', 'blockquote', 'br', 'code', 'del', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'ins', 'li', 'ol', 'p', 'pre',
  's', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
  'a', 'img', 'span',
];

const ALLOWED_ATTR = [
  'href', 'title', 'alt', 'src',
  'class',
  'target', 'rel',
  'colspan', 'rowspan',
];

// ─── Public API ───

export interface ChatMarkdownRenderOptions {
  /** Enable incomplete token completion for streaming content. */
  isStreaming?: boolean;
}

/**
 * Renders markdown content into an element using marked + highlight.js + DOMPurify.
 * All output is sanitized via DOMPurify.sanitize() before DOM insertion.
 *
 * @param el - Target element to render into
 * @param markdownText - Raw markdown string
 * @param options - Rendering options (streaming mode, etc.)
 */
export function renderChatMarkdown(
  el: Element,
  markdownText: string,
  options: ChatMarkdownRenderOptions = {},
): void {
  // Truncate extremely long content to prevent UI freeze (from VS Code)
  let value = markdownText;
  if (value.length > 100_000) {
    value = value.substring(0, 100_000) + '\u2026';
  }

  let html: string;
  if (options.isStreaming) {
    // Use fillInIncompleteTokens for streaming to handle partial markdown.
    // Must use lexer/parser path (not parse()) so we can modify tokens.
    const tokens = markedInstance.lexer(value);
    const completed = fillInIncompleteTokens(tokens);
    html = markedInstance.parser(completed);
  } else {
    // Synchronous parse — marked v17 is sync by default (async: false).
    html = markedInstance.parse(value, { async: false }) as string;
  }

  // Safe: DOMPurify.sanitize() strips all XSS vectors before DOM insertion
  el.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

// ─── Helpers ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── fillInIncompleteTokens (ported from VS Code, MIT license) ───
// Source: vs/base/browser/markdownRenderer.ts
// Handles incomplete markdown patterns during streaming.

const MAX_FIX_ROUNDS = 3;

export function fillInIncompleteTokens(tokens: marked.TokensList): marked.TokensList {
  for (let i = 0; i < MAX_FIX_ROUNDS; i++) {
    const newTokens = fillInIncompleteTokensOnce(tokens);
    if (newTokens) {
      tokens = newTokens;
    } else {
      break;
    }
  }
  return tokens;
}

function mergeRawTokenText(tokens: marked.Token[]): string {
  return tokens.map(t => t.raw).join('');
}

function fillInIncompleteTokensOnce(tokens: marked.TokensList): marked.TokensList | null {
  let i: number;
  let newTokens: marked.Token[] | undefined;

  for (i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'paragraph' && token.raw.match(/(\n|^)\|/)) {
      newTokens = completeTable(tokens.slice(i));
      break;
    }
  }

  const lastToken = tokens.at(-1);

  if (!newTokens && lastToken?.type === 'list') {
    const newListToken = completeListItemPattern(lastToken as marked.Tokens.List);
    if (newListToken) {
      newTokens = [newListToken];
      i = tokens.length - 1;
    }
  }

  if (!newTokens && lastToken?.type === 'paragraph') {
    const newToken = completeSingleLinePattern(lastToken as marked.Tokens.Paragraph);
    if (newToken) {
      newTokens = [newToken];
      i = tokens.length - 1;
    }
  }

  if (newTokens) {
    const result = [...tokens.slice(0, i), ...newTokens];
    (result as marked.TokensList).links = tokens.links;
    return result as marked.TokensList;
  }

  return null;
}

function completeSingleLinePattern(
  token: marked.Tokens.Text | marked.Tokens.Paragraph,
): marked.Token | undefined {
  if (!token.tokens) {
    return undefined;
  }

  for (let i = token.tokens.length - 1; i >= 0; i--) {
    const subtoken = token.tokens[i];
    if (subtoken.type === 'text') {
      const lines = subtoken.raw.split('\n');
      const lastLine = lines[lines.length - 1];

      if (lastLine.includes('`')) {
        return completeWithString(token, '`');
      }
      if (lastLine.includes('**')) {
        return completeWithString(token, '**');
      }
      if (lastLine.match(/\*\w/)) {
        return completeWithString(token, '*');
      }
      if (lastLine.match(/(^|\s)__\w/)) {
        return completeWithString(token, '__');
      }
      if (lastLine.match(/(^|\s)_\w/)) {
        return completeWithString(token, '_');
      }
      if (lastLine.match(/(^|\s)\[\w*[^\]]*$/)) {
        return completeWithString(token, '](https://placeholder.com)', false);
      }
    }
  }
  return undefined;
}

function completeListItemPattern(list: marked.Tokens.List): marked.Tokens.List | undefined {
  const lastItem = list.items[list.items.length - 1];
  const lastSubToken = lastItem.tokens?.[lastItem.tokens.length - 1];

  if (lastSubToken?.type === 'text' && !('inRawBlock' in lastItem)) {
    const newToken = completeSingleLinePattern(lastSubToken as marked.Tokens.Text);
    if (newToken && newToken.type === 'paragraph') {
      const previousText = mergeRawTokenText(list.items.slice(0, -1));
      const lead = lastItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
      if (!lead) {
        return undefined;
      }
      const newItemText =
        lead + mergeRawTokenText(lastItem.tokens.slice(0, -1)) + newToken.raw;
      const newList = marked.lexer(previousText + newItemText)[0] as marked.Tokens.List;
      return newList.type === 'list' ? newList : undefined;
    }
  }
  return undefined;
}

function completeWithString(
  token: marked.Token,
  closing: string,
  shouldTrim = true,
): marked.Token {
  const raw = mergeRawTokenText([token]);
  const text = shouldTrim ? raw.trimEnd() : raw;
  return marked.lexer(text + closing)[0];
}

function completeTable(tokens: marked.Token[]): marked.Token[] | undefined {
  const raw = mergeRawTokenText(tokens);
  const lines = raw.split('\n');

  let numCols: number | undefined;
  let hasSeparatorRow = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (numCols === undefined && line.match(/^\s*\|/)) {
      const matches = line.match(/(\|[^|]+)(?=\||$)/g);
      if (matches) {
        numCols = matches.length;
      }
    } else if (numCols !== undefined) {
      if (line.match(/^\s*\|/)) {
        if (i !== lines.length - 1) {
          return undefined;
        }
        hasSeparatorRow = true;
      } else {
        return undefined;
      }
    }
  }

  if (numCols !== undefined && numCols > 0) {
    const prefix = hasSeparatorRow ? lines.slice(0, -1).join('\n') : raw;
    const endsInPipe = !!prefix.match(/\|\s*$/);
    const newRaw = prefix + (endsInPipe ? '' : '|') + `\n|${' --- |'.repeat(numCols)}`;
    return marked.lexer(newRaw);
  }

  return undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/ui/src/browser/chatMarkdownRenderer.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Wire the new renderer into chatPanel.ts**

In `packages/ui/src/browser/chatPanel.ts`, make these exact changes:

**6a.** Replace the imports on lines 12-13:
```typescript
// REMOVE these two lines:
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ADD this line:
import { renderChatMarkdown } from './chatMarkdownRenderer.js';
```

**6b.** Remove the `marked.setOptions(...)` block (lines 16-19):
```typescript
// REMOVE this block:
marked.setOptions({
  breaks: true,
  gfm: true,
});
```

**6c.** Replace the `_setSanitizedMarkdown` method (lines 516-521):
```typescript
  // REPLACE with:
  private _setSanitizedMarkdown(el: Element, markdownText: string, isStreaming = false): void {
    renderChatMarkdown(el, markdownText, { isStreaming });
  }
```

**6d.** Update the call in `_updateAssistantContent` (line 534) to pass the streaming flag:
```typescript
  // CHANGE from:
  this._setSanitizedMarkdown(contentEl, this._currentAssistantMessage.content);
  // TO:
  this._setSanitizedMarkdown(contentEl, this._currentAssistantMessage.content, this._currentAssistantMessage.isStreaming ?? false);
```

- [ ] **Step 7: Verify build passes**

Run: `npx turbo build`
Expected: Clean compilation.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/chatMarkdownRenderer.ts packages/ui/src/browser/chatMarkdownRenderer.test.ts packages/ui/src/browser/chatPanel.ts packages/ui/package.json
git commit -m "feat: add chat markdown renderer with syntax highlighting

Extract markdown rendering from chatPanel into dedicated renderer.
Add highlight.js for code block syntax highlighting (14 languages).
Port fillInIncompleteTokens from VS Code (MIT) for streaming stability.
Tighten DOMPurify config with chat-specific tag allowlist."
```

---

## Chunk 3: Highlight.js Theme CSS

### Task 3: Add highlight.js color theme

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css` (add syntax highlighting colors)

highlight.js ships CSS themes, but they use hardcoded colors. We need colors that match VS Code's Dark+ theme for familiar code appearance, scoped to `.chat-message-content` to avoid conflicts.

- [ ] **Step 1: Add syntax highlighting CSS**

Add to `apps/desktop/src/renderer/styles.css`, after the code block CSS from Task 1:

```css
/* — Syntax highlighting (highlight.js theme) — */
/* VS Code Dark+ colors for familiar syntax coloring */

.chat-message-content .hljs {
  color: var(--fg-primary);
}

.chat-message-content .hljs-keyword,
.chat-message-content .hljs-selector-tag,
.chat-message-content .hljs-built_in,
.chat-message-content .hljs-type {
  color: #569cd6; /* blue — keywords */
}

.chat-message-content .hljs-string,
.chat-message-content .hljs-addition {
  color: #ce9178; /* orange — strings */
}

.chat-message-content .hljs-number,
.chat-message-content .hljs-literal {
  color: #b5cea8; /* green — numbers */
}

.chat-message-content .hljs-comment,
.chat-message-content .hljs-quote,
.chat-message-content .hljs-deletion {
  color: #6a9955; /* green — comments */
}

.chat-message-content .hljs-title,
.chat-message-content .hljs-section,
.chat-message-content .hljs-title.function_ {
  color: #dcdcaa; /* yellow — function names */
}

.chat-message-content .hljs-variable,
.chat-message-content .hljs-template-variable {
  color: #9cdcfe; /* light blue — variables */
}

.chat-message-content .hljs-attr,
.chat-message-content .hljs-attribute {
  color: #9cdcfe; /* light blue — attributes */
}

.chat-message-content .hljs-meta {
  color: #c586c0; /* purple — decorators, preprocessor */
}

.chat-message-content .hljs-regexp {
  color: #d16969; /* red — regex */
}

.chat-message-content .hljs-symbol,
.chat-message-content .hljs-bullet {
  color: #4ec9b0; /* teal — symbols */
}

.chat-message-content .hljs-params {
  color: var(--fg-primary);
}

.chat-message-content .hljs-emphasis {
  font-style: italic;
}

.chat-message-content .hljs-strong {
  font-weight: 600;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx turbo build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "feat: add syntax highlighting theme CSS for chat code blocks

Uses VS Code Dark+ colors for familiar syntax coloring.
Scoped to .chat-message-content to avoid conflicts."
```

---

## Chunk 4: E2E Verification

### Task 4: Add Playwright test for markdown rendering

**Files:**
- Create: `tests/e2e/chat-markdown.spec.ts`

- [ ] **Step 1: Create Playwright test for markdown rendering**

Create `tests/e2e/chat-markdown.spec.ts`:

```typescript
import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-markdown');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [resolve(appPath, 'out/main/index.js')],
    cwd: appPath,
    env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
  });
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Chat markdown rendering', () => {
  test('help command renders with proper HTML elements, not raw markdown', async () => {
    // Use the /help slash command which returns markdown with
    // **bold**, `code`, and - list items
    const input = page.locator('.chat-input');
    await expect(input).toBeVisible();

    await input.fill('/');
    const dropdown = page.locator('.slash-dropdown');
    await expect(dropdown).toBeVisible({ timeout: 2000 });

    const helpItem = page.locator('.slash-dropdown-item', { hasText: '/help' });
    await helpItem.click();

    // Wait for the help message to appear
    const assistantMsg = page.locator('.chat-message-assistant').last();
    await expect(assistantMsg).toBeVisible({ timeout: 5000 });

    const content = assistantMsg.locator('.chat-message-content');

    // Verify markdown elements are rendered as HTML, not raw syntax
    await expect(content.locator('strong').first()).toBeVisible();
    await expect(content.locator('code').first()).toBeVisible();
    await expect(content.locator('li').first()).toBeVisible();

    // Verify no raw markdown syntax is visible in text
    const text = await content.textContent();
    expect(text).not.toContain('**');

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'tests/e2e/screenshots/chat-markdown.png',
      fullPage: true,
    });
  });
});
```

- [ ] **Step 2: Run the E2E test**

Run: `npx playwright test tests/e2e/chat-markdown.spec.ts`
Expected: PASS — the help message renders with proper HTML elements.

- [ ] **Step 3: View screenshot to verify visual quality**

Read the screenshot and verify:
- Bold text appears bold (not wrapped in `**`)
- Inline code has background styling
- List items have bullet points / proper indentation
- Overall readability is good

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/chat-markdown.spec.ts
git commit -m "test: add E2E test for chat markdown rendering

Verifies help message renders with proper HTML elements
(strong, code, li) rather than raw markdown syntax."
```

---

## Chunk 5: HARD GATE Verification

### Task 5: Launch the app and verify markdown rendering

Per CLAUDE.md: *"After completing any phase or feature that touches UI: you MUST run `npm run desktop:dev`, exercise the primary user flow, and report what you observed."*

**Files:**
- Create (temp): `tests/e2e/verify-markdown.mjs` (Playwright screenshot script, delete after)

- [ ] **Step 1: Build the app**

Run: `npx turbo build`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Write temp verification script**

Create `tests/e2e/verify-markdown.mjs`:

```javascript
import { _electron } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = resolve(__dirname, '../../apps/desktop');
const userDataDir = resolve(__dirname, '../../.e2e-userdata-verify-md');
mkdirSync(userDataDir, { recursive: true });
writeFileSync(resolve(userDataDir, 'onboarding-complete.json'), '{"complete":true}');

const screenshotDir = resolve(__dirname, 'screenshots');
mkdirSync(screenshotDir, { recursive: true });

const app = await _electron.launch({
  args: [resolve(appPath, 'out/main/index.js')],
  cwd: appPath,
  env: { ...process.env, GHO_USER_DATA_DIR: userDataDir },
});

const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');

// Trigger /help to get markdown content
const input = page.locator('.chat-input');
await input.fill('/');
await page.waitForTimeout(500);
const helpItem = page.locator('.slash-dropdown-item', { hasText: '/help' });
await helpItem.click();
await page.waitForTimeout(1000);

// Screenshot 1: help message with markdown
await page.screenshot({ path: resolve(screenshotDir, 'verify-md-help.png'), fullPage: true });

// Now send a message that will produce a response with code blocks
const sendBtn = page.locator('.chat-send-btn');
await page.waitForSelector('.chat-send-btn', { state: 'visible', timeout: 5000 });
await input.fill('Show me a simple TypeScript hello world with a code block');
await input.press('Enter');

// Wait for streaming to complete
await page.waitForSelector('.chat-cursor', { state: 'hidden', timeout: 30000 });

// Screenshot 2: response with code block (check syntax highlighting)
await page.screenshot({ path: resolve(screenshotDir, 'verify-md-codeblock.png'), fullPage: true });

await app.close();
console.log('Screenshots saved to tests/e2e/screenshots/');
```

- [ ] **Step 3: Run the verification script**

Run: `npx playwright test tests/e2e/verify-markdown.mjs` (or `node tests/e2e/verify-markdown.mjs`)

- [ ] **Step 4: View screenshots and verify**

Read the screenshots with the Read tool. Verify:
1. **verify-md-help.png**: Bold text rendered bold, inline code has dark background, list items have bullets
2. **verify-md-codeblock.png**: Code block has border + background, syntax highlighting colors visible (blue keywords, orange strings, etc.), no raw markdown syntax visible

- [ ] **Step 5: Clean up temp script and commit**

Delete `tests/e2e/verify-markdown.mjs` after verification.

---

## Implementation Notes

### What we're reusing from VS Code (MIT license)
1. **`fillInIncompleteTokens()`** — Ported from `vs/base/browser/markdownRenderer.ts`. Handles streaming markdown gracefully.
2. **Allowed tags list** — From `chatContentMarkdownRenderer.ts`. Defines safe HTML tags for chat context.
3. **Markdown CSS patterns** — From `extensions/markdown-language-features/media/markdown.css`. Heading sizes, table layout, blockquote borders.
4. **Syntax highlighting colors** — VS Code Dark+ theme values for familiar code appearance.

### What we're NOT doing (and why)
- **No Monaco for code blocks** — Monaco is ~2MB and requires complex lifecycle management. highlight.js at ~34KB covers our needs for display-only code.
- **No custom scrollbar for tables** — VS Code uses `DomScrollableElement`. We use CSS `overflow-x: auto` which is simpler and works well enough.
- **No link rewriting to data-href** — VS Code clears `href` and stores in `data-href` for security. Our DOMPurify config already strips dangerous protocols, which is sufficient for our threat model (no `command:` URIs, no extension API).
- **No KaTeX math** — Not needed for office productivity chat.
- **No theme icon rendering** — We don't have codicons in chat messages.

### Future enhancements (not in this plan)
- Copy button on code blocks
- Line numbers in code blocks
- Code block language label
- Collapsible long code blocks
- Image preview/lightbox
