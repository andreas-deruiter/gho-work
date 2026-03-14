import { describe, it, expect } from 'vitest';
import { getFileIcon, createFileIconSVG, getFolderIconSVG } from '../fileIcons.js';

describe('getFileIcon', () => {
  it('returns correct icon for known extensions', () => {
    expect(getFileIcon('report.md')).toEqual({ icon: 'markdown', color: '#6b9ff4' });
    expect(getFileIcon('data.xlsx')).toEqual({ icon: 'excel', color: '#0f9d58' });
    expect(getFileIcon('photo.png')).toEqual({ icon: 'image', color: '#c678dd' });
  });

  it('returns default icon for unknown extensions', () => {
    expect(getFileIcon('mystery.xyz')).toEqual({ icon: 'file', color: '#888' });
  });

  it('handles files with no extension', () => {
    expect(getFileIcon('Makefile')).toEqual({ icon: 'file', color: '#888' });
  });

  it('is case-insensitive for extensions', () => {
    expect(getFileIcon('README.MD')).toEqual({ icon: 'markdown', color: '#6b9ff4' });
  });
});

describe('createFileIconSVG', () => {
  it('returns an SVG element', () => {
    const svg = createFileIconSVG('test.ts');
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});

describe('getFolderIconSVG', () => {
  it('returns an SVG element with folder color', () => {
    const svg = getFolderIconSVG(false);
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });
});
