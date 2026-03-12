#!/usr/bin/env node
/**
 * Patches vscode-jsonrpc to add ESM `exports` field.
 *
 * The @github/copilot-sdk depends on vscode-jsonrpc, but the SDK's session.js
 * imports `from "vscode-jsonrpc/node"` (ESM subpath). vscode-jsonrpc@8.2.1
 * has no `exports` field, so Node's ESM resolver can't resolve the subpath.
 * This patch adds the missing exports map.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', 'vscode-jsonrpc', 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('vscode-jsonrpc not installed, skipping patch');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.exports) {
  console.log('vscode-jsonrpc already has exports field, skipping patch');
  process.exit(0);
}

pkg.exports = {
  '.': './lib/node/main.js',
  './node': './node.js',
  './node.js': './node.js',
  './browser': './browser.js',
  './browser.js': './browser.js',
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
console.log('Patched vscode-jsonrpc: added ESM exports field');
