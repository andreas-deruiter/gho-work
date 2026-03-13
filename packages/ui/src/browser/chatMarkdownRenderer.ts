/**
 * Chat markdown renderer — renders markdown strings to DOM elements.
 *
 * Uses marked for parsing, highlight.js for code syntax highlighting,
 * and DOMPurify for XSS prevention. Includes streaming support via
 * fillInIncompleteTokens (ported from VS Code, MIT license).
 */
import { marked, Marked, Renderer, type Token, type TokensList, type Tokens } from 'marked';
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

const renderer = new Renderer();

renderer.code = function ({ text, lang }: Tokens.Code): string {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  let highlighted: string;
  try {
    highlighted = hljs.highlight(text, { language }).value;
  } catch {
    highlighted = escapeHtml(text);
  }
  return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>`;
};

const markedInstance = new Marked({ renderer, breaks: true, gfm: true });

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
  // eslint-disable-next-line no-unsanitized/property
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

export function fillInIncompleteTokens(tokens: TokensList): TokensList {
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

function mergeRawTokenText(tokens: Token[]): string {
  return tokens.map(t => t.raw).join('');
}

function fillInIncompleteTokensOnce(tokens: TokensList): TokensList | null {
  let i: number;
  let newTokens: Token[] | undefined;

  for (i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'paragraph' && token.raw.match(/(\n|^)\|/)) {
      newTokens = completeTable(tokens.slice(i));
      break;
    }
  }

  const lastToken = tokens.at(-1);

  if (!newTokens && lastToken?.type === 'list') {
    const newListToken = completeListItemPattern(lastToken as Tokens.List);
    if (newListToken) {
      newTokens = [newListToken];
      i = tokens.length - 1;
    }
  }

  if (!newTokens && lastToken?.type === 'paragraph') {
    const newToken = completeSingleLinePattern(lastToken as Tokens.Paragraph);
    if (newToken) {
      newTokens = [newToken];
      i = tokens.length - 1;
    }
  }

  if (newTokens) {
    const result = [...tokens.slice(0, i), ...newTokens];
    (result as TokensList).links = tokens.links;
    return result as TokensList;
  }

  return null;
}

function completeSingleLinePattern(
  token: Tokens.Text | Tokens.Paragraph,
): Token | undefined {
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

function completeListItemPattern(list: Tokens.List): Tokens.List | undefined {
  const lastItem = list.items[list.items.length - 1];
  const lastSubToken = lastItem.tokens?.[lastItem.tokens.length - 1];

  if (lastSubToken?.type === 'text' && !('inRawBlock' in lastItem)) {
    const newToken = completeSingleLinePattern(lastSubToken as Tokens.Text);
    if (newToken && newToken.type === 'paragraph') {
      const previousText = mergeRawTokenText(list.items.slice(0, -1));
      const lead = lastItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
      if (!lead) {
        return undefined;
      }
      const newItemText =
        lead + mergeRawTokenText(lastItem.tokens.slice(0, -1)) + newToken.raw;
      const newList = marked.lexer(previousText + newItemText)[0] as Tokens.List;
      return newList.type === 'list' ? newList : undefined;
    }
  }
  return undefined;
}

function completeWithString(
  token: Token,
  closing: string,
  shouldTrim = true,
): Token {
  const raw = mergeRawTokenText([token]);
  const text = shouldTrim ? raw.trimEnd() : raw;
  return marked.lexer(text + closing)[0];
}

function completeTable(tokens: Token[]): Token[] | undefined {
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
