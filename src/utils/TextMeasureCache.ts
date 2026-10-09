/**
 * Memoized canvas text measurement for the timeline renderer.
 *
 * Measuring text is the costliest thing a timeline frame does, and the same
 * labels come back on every frame while the user pans or zooms. Answers are
 * kept per font: the font is part of the key, so a change of face cannot return
 * a width measured in another one. The owner clears this when a web font
 * finishes loading, because the same font string then measures differently.
 */
export type MeasuringContext = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

export class TextMeasureCache {
    private readonly widths = new Map<string, Map<string, number>>();
    private readonly truncations = new Map<string, Map<string, Map<number, string>>>();

    /** @param limit bound per font on remembered labels, so a session cannot grow them without end. */
    constructor(private readonly limit: number) {}

    measure(ctx: MeasuringContext, value: string, font: string = ctx.font): number {
        let byText = this.widths.get(font);
        if (!byText) { byText = new Map(); this.widths.set(font, byText); }
        let width = byText.get(value);
        if (width === undefined) {
            width = ctx.measureText(value).width;
            if (byText.size >= this.limit) byText.clear();
            byText.set(value, width);
        }
        return width;
    }

    /**
     * The value itself when it fits in `width`, otherwise the longest prefix
     * that fits once an ellipsis is added. Same answer as the uncached loop it
     * replaces; only the measuring is remembered.
     */
    truncate(ctx: MeasuringContext, value: string, width: number): string {
        const font = ctx.font;
        if (this.measure(ctx, value, font) <= width) return value;
        let byText = this.truncations.get(font);
        if (!byText) { byText = new Map(); this.truncations.set(font, byText); }
        let byWidth = byText.get(value);
        if (!byWidth) {
            if (byText.size >= this.limit) byText.clear();
            byWidth = new Map();
            byText.set(value, byWidth);
        }
        const cached = byWidth.get(width);
        if (cached !== undefined) return cached;
        let text = value;
        while (text.length > 1 && this.measure(ctx, `${text}…`, font) > width) text = text.slice(0, -1);
        const result = `${text}…`;
        if (byWidth.size >= this.limit) byWidth.clear();
        byWidth.set(width, result);
        return result;
    }

    clear(): void {
        this.widths.clear();
        this.truncations.clear();
    }
}
