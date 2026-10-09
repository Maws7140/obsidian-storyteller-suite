/**
 * Wrap a button action so that a second activation while the first is still
 * running does nothing. A double click on Save or Create otherwise starts two
 * writes: the second one finds the file the first just created and reports a
 * false failure. onBusyChange lets the caller disable the button meanwhile.
 */
export function singleFlight(
    action: () => Promise<void>,
    onBusyChange?: (busy: boolean) => void
): () => void {
    let busy = false;
    return () => {
        if (busy) return;
        busy = true;
        onBusyChange?.(true);
        void (async () => {
            try {
                await action();
            } catch (error) {
                console.error('Storyteller Suite: action failed', error);
            } finally {
                busy = false;
                onBusyChange?.(false);
            }
        })();
    };
}
