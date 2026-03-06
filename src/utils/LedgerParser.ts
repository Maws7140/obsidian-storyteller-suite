/**
 * Parser for ```ledger fenced blocks in entity markdown files.
 *
 * Line syntax: [date | ] amount | description
 *   date        — optional ISO date or free-form string
 *   amount      — signed number followed by optional currency label:
 *                 +100gp  -25sp  +5pp  50  -3ep  +200cp
 *                 If no currency label is given, defaults to "gp"
 *   description — free text describing the transaction
 *
 * Supported D&D denominations and their copper equivalents:
 *   pp = 1000 cp   gp = 100 cp   ep = 50 cp   sp = 10 cp   cp = 1 cp
 */

export interface LedgerEntry {
    date?: string;
    rawAmount: string;
    description: string;
    /** Signed copper-piece value of this transaction */
    cpValue: number;
}

export interface Balance {
    pp: number;
    gp: number;
    ep: number;
    sp: number;
    cp: number;
}

const CP_PER: Record<string, number> = {
    pp: 1000,
    gp: 100,
    ep: 50,
    sp: 10,
    cp: 1
};

const AMOUNT_RE = /^([+-]?\d+(?:\.\d+)?)\s*([a-z]+)?$/i;

/** Parse a signed amount string like "+100gp" or "-25sp" into cp. Returns NaN if unparseable. */
export function parseAmount(raw: string): number {
    const m = raw.trim().match(AMOUNT_RE);
    if (!m) return NaN;
    const num = parseFloat(m[1]);
    const label = (m[2] || 'gp').toLowerCase();
    const perCp = CP_PER[label] ?? 100; // unknown label → treat as gp
    return Math.round(num * perCp);
}

/** Parse a single ledger line. Returns null for blank/comment lines. */
export function parseLedgerLine(line: string): LedgerEntry | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const parts = trimmed.split('|').map(p => p.trim());
    // 3 parts: date | amount | description
    // 2 parts: amount | description
    if (parts.length < 2) return null;

    let date: string | undefined;
    let rawAmount: string;
    let description: string;

    if (parts.length >= 3) {
        date = parts[0] || undefined;
        rawAmount = parts[1];
        description = parts.slice(2).join(' | ');
    } else {
        rawAmount = parts[0];
        description = parts[1];
    }

    const cpValue = parseAmount(rawAmount);
    if (isNaN(cpValue)) return null;

    return { date, rawAmount, description, cpValue };
}

/** Parse the contents of a ```ledger block (text between the fences). */
export function parseLedger(blockContent: string): LedgerEntry[] {
    return blockContent
        .split('\n')
        .map(parseLedgerLine)
        .filter((e): e is LedgerEntry => e !== null);
}

/** Extract all ```ledger blocks from a full markdown document and return their entries. */
export function extractLedgerEntries(markdown: string): LedgerEntry[] {
    const entries: LedgerEntry[] = [];
    const fenceRe = /```ledger\s*\n([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(markdown)) !== null) {
        entries.push(...parseLedger(match[1]));
    }
    return entries;
}

/** Compute a Balance breakdown from an array of LedgerEntry values. */
export function computeBalance(entries: LedgerEntry[]): Balance {
    const totalCp = entries.reduce((sum, e) => sum + e.cpValue, 0);
    return cpToBalance(totalCp);
}

/** Convert a raw cp total to a denominated Balance object. */
export function cpToBalance(totalCp: number): Balance {
    const sign = totalCp < 0 ? -1 : 1;
    let remaining = Math.abs(totalCp);
    const pp = Math.floor(remaining / 1000); remaining -= pp * 1000;
    const gp = Math.floor(remaining / 100);  remaining -= gp * 100;
    const ep = Math.floor(remaining / 50);   remaining -= ep * 50;
    const sp = Math.floor(remaining / 10);   remaining -= sp * 10;
    const cp = remaining;
    return { pp: sign * pp, gp: sign * gp, ep: sign * ep, sp: sign * sp, cp: sign * cp };
}

/** Format a Balance as a compact human-readable string, omitting zero denominations. */
export function formatBalance(b: Balance): string {
    const parts: string[] = [];
    if (b.pp) parts.push(`${b.pp}pp`);
    if (b.gp) parts.push(`${b.gp}gp`);
    if (b.ep) parts.push(`${b.ep}ep`);
    if (b.sp) parts.push(`${b.sp}sp`);
    if (b.cp) parts.push(`${b.cp}cp`);
    return parts.length ? parts.join(' ') : '0gp';
}

/** Parse a balance string like "50gp 25sp" back into a Balance. */
export function parseBalanceString(raw: string): Balance {
    const totalCp = raw.trim().split(/\s+/).reduce((sum, part) => {
        const cp = parseAmount(part);
        return sum + (isNaN(cp) ? 0 : cp);
    }, 0);
    return cpToBalance(totalCp);
}

/**
 * Append a new ledger entry to a markdown string.
 * If a ```ledger block already exists, the entry is appended inside it.
 * Otherwise a new block is inserted before the last heading (or at the end).
 */
export function appendLedgerEntry(markdown: string, entry: string): string {
    const closeRe = /```(\s*)$/m;
    const openRe = /```ledger/i;

    if (openRe.test(markdown)) {
        // Find the last ```ledger block and inject before its closing ```
        const lastOpen = markdown.lastIndexOf('```ledger');
        const closeAfter = markdown.indexOf('```', lastOpen + 9);
        if (closeAfter !== -1) {
            return (
                markdown.slice(0, closeAfter) +
                entry + '\n' +
                markdown.slice(closeAfter)
            );
        }
    }

    // No existing block — append a new one at the end
    const block = `\n## Transactions\n\`\`\`ledger\n${entry}\n\`\`\`\n`;
    return markdown.trimEnd() + block;
}
