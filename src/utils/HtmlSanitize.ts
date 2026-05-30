/**
 * Defensive HTML sanitiser for the places that render template-generated HTML
 * into the live DOM (e.g. the character-sheet preview).
 *
 * Character-sheet templates are user-editable, so their generated markup is not
 * fully trusted. We already drop <script>/<iframe>/<object>/<embed>; this also
 * removes inline on* event handlers and javascript: URLs so no attribute- or
 * URL-based execution vector survives.
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
