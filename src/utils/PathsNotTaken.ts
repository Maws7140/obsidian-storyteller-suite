/**
 * Choices a campaign passed over. The Campaign view writes them onto the
 * event of the scene they were offered in (`pathsNotTaken`); the timeline can
 * show them as faded markers beside that event. They are never saved as
 * events of their own.
 */
import type { Event } from '../types';

/** Marks a derived marker, so it is drawn faded and never saved or dragged. */
export const PATH_NOT_TAKEN_TAG = 'path-not-taken';

/** The first date of an event's range: where its choices were offered. */
function startOf(dateTime: string | undefined): string | undefined {
    return dateTime?.split(/\s+(?:to|through|until)\s+/i)[0]?.trim() || undefined;
}

/** One marker per choice not taken, at the start of the scene's event, opening that event's note. */
export function pathsNotTakenEvents(event: Event): Event[] {
    const paths = (event.pathsNotTaken ?? []).filter(label => label.trim().length > 0);
    const dateTime = startOf(event.dateTime);
    if (!paths.length || !dateTime || event.tags?.includes(PATH_NOT_TAKEN_TAG)) return [];
    return paths.map((label, index) => ({
        id: `${event.id ?? event.name}::${PATH_NOT_TAKEN_TAG}::${index}`,
        name: `Not taken: ${label}`,
        dateTime,
        description: `A choice offered in ${event.name} that the party did not take.`,
        filePath: event.filePath,
        characters: event.characters,
        location: event.location,
        groups: event.groups,
        branches: event.branches,
        sessionId: event.sessionId,
        sessionName: event.sessionName,
        tags: [PATH_NOT_TAKEN_TAG],
    }));
}
