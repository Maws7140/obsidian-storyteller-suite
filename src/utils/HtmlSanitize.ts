/**
 * Defensive HTML sanitiser for places that render template-generated HTML into
 * the live DOM, such as the character-sheet preview.
 */

const EXECUTABLE_TAGS = ['script', 'iframe', 'object', 'embed'];

/** Remove executable nodes and dangerous attributes from a parsed document/element in place. */
export function sanitizeNode(root: Document | Element): void {
    EXECUTABLE_TAGS.forEach(tag => {
        root.querySelectorAll(tag).forEach(el => el.remove());
    });

    root.querySelectorAll('*').forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            const value = attr.value.replace(/\s+/g, '').toLowerCase();
            if (name.startsWith('on')) {
                el.removeAttribute(attr.name);
            } else if (
                (name === 'href' || name === 'src' || name === 'xlink:href') &&
                value.startsWith('javascript:')
            ) {
                el.removeAttribute(attr.name);
            }
        });
    });
}
