import type { InkHost } from './host';

/** Give the sanitizer an SVG root so the fragment keeps the SVG namespace. */
export function sanitizeSvgChildren(host: Pick<InkHost, 'sanitizeSvg'>, markup: string): Element[] {
	const svg = host.sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`).firstElementChild;
	return svg ? Array.from(svg.children) : [];
}
