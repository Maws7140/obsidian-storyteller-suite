/**
 * Last-started-wins token for async work that can be overtaken by a newer request.
 * Each begin() makes every earlier token stale; callers check isCurrent() after each await
 * and drop their work when it returns false.
 */
export class LatestToken {
    private current = 0;

    /** Start a new unit of work and return its token. */
    begin(): number {
        return ++this.current;
    }

    /** True while `token` is still the most recently started one. */
    isCurrent(token: number): boolean {
        return token === this.current;
    }
}
