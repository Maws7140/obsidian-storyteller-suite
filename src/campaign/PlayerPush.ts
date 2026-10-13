/**
 * The contract between the DM's play screen and the player screen.
 *
 * The DM picks a header in a note and pushes the text under it. The player
 * screen shows it as a popup the players close, or pins it to a "Story"
 * strip until the DM clears it. Only the pushed text travels: never the
 * rest of the note, so DM notes and other headers stay on the DM's side.
 *
 * The bus is in-process for now (the player window lives in the DM's
 * Obsidian). A table link later sends the same PlayerPush objects over the
 * network, so nothing here may hold a reference into the vault.
 */

/** View type of the player screen window. Lives here so the DM view can find it without importing the view. */
export const VIEW_TYPE_PLAYER_SCREEN = 'storyteller-player-screen';

export type PlayerPushMode = 'popup' | 'pinned';

export interface PlayerPush {
    /** Unique per push, so the player screen can dismiss or unpin it. */
    id: string;
    /** Note the text came from, for the DM's log only. */
    sourceName: string;
    /** The header the DM picked. Shown as the card title. */
    heading: string;
    /** Markdown under that header, already cut out of the note. */
    markdown: string;
    mode: PlayerPushMode;
    /** Character name for a push to one player; absent means everyone. */
    target?: string;
    /** Date.now() when pushed. */
    at: number;
}

export interface NoteSection {
    heading: string;
    /** 2 for ##, 3 for ###, and so on. */
    level: number;
    markdown: string;
}

type Listener = (state: PlayerScreenState) => void;

/** What the player screen shows behind any pushed text. */
export type PlayerScreenMode = 'board' | 'scene' | 'blank';

/** The DM's switches for the player screen. They live on the bus, so they outlast a redraw of the DM view. */
export interface PlayerScreenControls {
    mode: PlayerScreenMode;
    /** The players see the open choices, numbered on the board and in a list. */
    voteOpen: boolean;
    /** Encounter rolls and choice rolls appear on the player screen. */
    showRolls: boolean;
}

/** A place on the board, positioned in percent of the map image so any screen size can draw it. */
export interface PlayerBoardPlace {
    key: string;
    name: string;
    /** Percent from the left and from the top of the map image. */
    x: number;
    y: number;
    /** Where the party is now. */
    current: boolean;
}

/** A choice as the players see it while a vote is open. */
export interface PlayerChoice {
    number: number;
    label: string;
    /** The place it leads to, when the players have seen that place. */
    toKey?: string;
    /** Leads somewhere on the board the players have not seen: drawn as a path into the fog. */
    intoFog?: { x: number; y: number };
}

export interface PlayerPartyMember {
    name: string;
    hp?: number;
    maxHp?: number;
    conditions: string[];
}

export interface PlayerClock {
    name: string;
    filled: number;
    segments: number;
}

/**
 * Everything the player screen draws besides pushed text, already cut down to what players may
 * see: only revealed places, only choices the DM opened to a vote, only public clocks.
 */
export interface PlayerView {
    sessionName: string;
    sceneName?: string;
    date?: string;
    board?: {
        name: string;
        imageUrl: string;
        width: number;
        height: number;
        /** Revealed places only; the rest of the map is fog. */
        places: PlayerBoardPlace[];
    };
    party: PlayerPartyMember[];
    clocks: PlayerClock[];
    /** Present while the DM has a vote open. */
    choices?: PlayerChoice[];
    /** The latest roll the DM chose to show. */
    roll?: { title: string; total: number; result: string; at: number };
}

export interface PlayerScreenState {
    /** Popups not yet closed, oldest first. */
    popups: PlayerPush[];
    /** Pinned pushes, oldest first. */
    pinned: PlayerPush[];
    controls: PlayerScreenControls;
    /** The latest snapshot from the DM view, or null when no session is being played. */
    view: PlayerView | null;
}

/**
 * Splits a note into its sections by Markdown header (# to ######),
 * skipping frontmatter and headers inside code fences. Text before the
 * first header is not a section. A section runs to the next header of the
 * same or higher level, so a ## section includes its ### children.
 */
export function splitNoteSections(content: string): NoteSection[] {
    let body = content ?? '';
    const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(body);
    if (fm) body = body.slice(fm[0].length);

    const lines = body.split(/\r?\n/);
    const heads: { heading: string; level: number; line: number }[] = [];
    let fence: string | null = null;
    lines.forEach((line, i) => {
        const f = /^\s*(```+|~~~+)/.exec(line);
        if (f) {
            if (fence === null) fence = f[1][0];
            else if (f[1][0] === fence) fence = null;
            return;
        }
        if (fence !== null) return;
        const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (h) heads.push({ heading: h[2].trim(), level: h[1].length, line: i });
    });

    return heads.map((h, idx) => {
        let end = lines.length;
        for (let j = idx + 1; j < heads.length; j++) {
            if (heads[j].level <= h.level) { end = heads[j].line; break; }
        }
        return {
            heading: h.heading,
            level: h.level,
            markdown: lines.slice(h.line + 1, end).join('\n').trim(),
        };
    });
}

/** What the player screen is showing, and who is listening for changes. */
export class PlayerScreenBus {
    private state: PlayerScreenState = {
        popups: [],
        pinned: [],
        controls: { mode: 'board', voteOpen: false, showRolls: true },
        view: null,
    };
    private listeners = new Set<Listener>();

    push(push: Omit<PlayerPush, 'id' | 'at'>): PlayerPush {
        const full: PlayerPush = {
            ...push,
            id: `push-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            at: Date.now(),
        };
        if (full.mode === 'pinned') this.state = { ...this.state, pinned: [...this.state.pinned, full] };
        else this.state = { ...this.state, popups: [...this.state.popups, full] };
        this.emit();
        return full;
    }

    /** Closes a popup or unpins a pinned push. */
    dismiss(id: string): void {
        this.state = {
            ...this.state,
            popups: this.state.popups.filter(p => p.id !== id),
            pinned: this.state.pinned.filter(p => p.id !== id),
        };
        this.emit();
    }

    /** Takes all pushed text off the player screen. The board and party stay. */
    clear(): void {
        this.state = { ...this.state, popups: [], pinned: [] };
        this.emit();
    }

    setControls(controls: Partial<PlayerScreenControls>): void {
        this.state = { ...this.state, controls: { ...this.state.controls, ...controls } };
        this.emit();
    }

    /** Replaces the game snapshot. Skips the redraw when nothing in it changed. */
    setView(view: PlayerView | null): void {
        if (JSON.stringify(view) === JSON.stringify(this.state.view)) return;
        this.state = { ...this.state, view };
        this.emit();
    }

    getState(): PlayerScreenState {
        return this.state;
    }

    /** Calls the listener now and on every change. Returns an unsubscribe. */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }

    private emit(): void {
        for (const l of this.listeners) l(this.state);
    }
}
