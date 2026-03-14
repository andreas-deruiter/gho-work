interface FileIconInfo {
  icon: string;
  color: string;
}

const FILE_ICON_MAP: Record<string, FileIconInfo> = {
  md:    { icon: 'markdown', color: '#6b9ff4' },
  docx:  { icon: 'word',     color: '#4285f4' },
  doc:   { icon: 'word',     color: '#4285f4' },
  pdf:   { icon: 'pdf',      color: '#e06c75' },
  txt:   { icon: 'text',     color: '#aaa' },
  rtf:   { icon: 'text',     color: '#aaa' },
  xlsx:  { icon: 'excel',    color: '#0f9d58' },
  xls:   { icon: 'excel',    color: '#0f9d58' },
  csv:   { icon: 'csv',      color: '#0f9d58' },
  pptx:  { icon: 'powerpoint', color: '#d04423' },
  ppt:   { icon: 'powerpoint', color: '#d04423' },
  png:   { icon: 'image',    color: '#c678dd' },
  jpg:   { icon: 'image',    color: '#c678dd' },
  jpeg:  { icon: 'image',    color: '#c678dd' },
  gif:   { icon: 'image',    color: '#c678dd' },
  svg:   { icon: 'image',    color: '#c678dd' },
  ts:    { icon: 'code',     color: '#3178c6' },
  js:    { icon: 'code',     color: '#f1e05a' },
  py:    { icon: 'code',     color: '#3572a5' },
  json:  { icon: 'json',     color: '#febc2e' },
  yaml:  { icon: 'yaml',     color: '#febc2e' },
  yml:   { icon: 'yaml',     color: '#febc2e' },
  xml:   { icon: 'xml',      color: '#febc2e' },
  zip:   { icon: 'archive',  color: '#888' },
  tar:   { icon: 'archive',  color: '#888' },
  gz:    { icon: 'archive',  color: '#888' },
};

const DEFAULT_ICON: FileIconInfo = { icon: 'file', color: '#888' };
const FOLDER_COLOR = '#febc2e';

export function getFileIcon(filename: string): FileIconInfo {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  return FILE_ICON_MAP[ext] ?? DEFAULT_ICON;
}

function createSVG(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function makePath(d: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

function makePolyline(points: string): SVGPolylineElement {
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', points);
  return poly;
}

export function createFileIconSVG(filename: string): SVGSVGElement {
  const { color } = getFileIcon(filename);
  const svg = createSVG();
  svg.style.color = color;
  svg.appendChild(makePath('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'));
  svg.appendChild(makePolyline('14,2 14,8 20,8'));
  return svg;
}

export function getFolderIconSVG(expanded: boolean): SVGSVGElement {
  const svg = createSVG();
  svg.style.color = FOLDER_COLOR;
  if (expanded) {
    svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
  } else {
    svg.appendChild(makePath('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'));
  }
  return svg;
}
