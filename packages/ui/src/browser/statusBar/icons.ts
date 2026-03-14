const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  return svg;
}

export function createFolderIcon(): SVGSVGElement {
  const svg = createSvg(14, 14);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z');
  svg.appendChild(path);
  return svg;
}

export function createUserIcon(): SVGSVGElement {
  const svg = createSvg(14, 14);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '7');
  circle.setAttribute('r', '4');
  svg.appendChild(path);
  svg.appendChild(circle);
  return svg;
}
