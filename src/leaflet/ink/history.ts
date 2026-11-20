/**
 * Undo and redo stack for Map Ink. Stores snapshots; it never mutates them.
 *
 * `push(state)` records the state from before a change. Pushes that share a
 * coalesceKey with the immediately previous push do not add a step, so a slider
 * drag or a typed field is one undo step. A push with no key, or a different
 * key, ends the run. Undo and redo also end the run.
 *
 * Pure TypeScript: no Obsidian or DOM imports.
 */
export class InkHistory<T> {
	static readonly CAP = 100;

	private past: T[] = [];
	private future: T[] = [];
	private lastKey: string | undefined = undefined;

	constructor(private readonly cap: number = InkHistory.CAP) {}

	/** Record the state before a change. */
	push(state: T, coalesceKey?: string): void {
		const coalesced = coalesceKey !== undefined && coalesceKey === this.lastKey && this.past.length > 0;
		this.future = [];
		this.lastKey = coalesceKey;
		if (coalesced) return;
		this.past.push(state);
		if (this.past.length > this.cap) this.past.splice(0, this.past.length - this.cap);
	}

	/** Step back. Returns the previous state, or undefined when there is nothing to undo. `current` goes to the redo stack. */
	undo(current: T): T | undefined {
		this.lastKey = undefined;
		if (this.past.length === 0) return undefined;
		const previous = this.past.pop() as T;
		this.future.push(current);
		return previous;
	}

	/** Step forward. Returns the next state, or undefined when there is nothing to redo. `current` goes back on the undo stack. */
	redo(current: T): T | undefined {
		this.lastKey = undefined;
		if (this.future.length === 0) return undefined;
		const next = this.future.pop() as T;
		this.past.push(current);
		if (this.past.length > this.cap) this.past.splice(0, this.past.length - this.cap);
		return next;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	/** Drop all history. */
	clear(): void {
		this.past = [];
		this.future = [];
		this.lastKey = undefined;
	}
}
