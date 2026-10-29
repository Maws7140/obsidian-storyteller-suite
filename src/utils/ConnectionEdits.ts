// Helpers for editing an existing character connection in place.
// Pure logic: the character modal wires them to the relationship editor.

import type { TypedRelationship } from '../types';
import { getRelationshipTargetRef } from './EntityRefUtils';
import { resolveDirection } from './RelationshipKinds';

/**
 * The relationship editor's starting value for a stored connection. Legacy
 * shapes (`targetId`, `name`) are normalised to a display-name target, and the
 * direction is made explicit so the editor shows what the note means.
 */
export function connectionForEditing(
    conn: TypedRelationship,
    resolveName: (ref: string) => string
): TypedRelationship {
    return {
        target: resolveName(getRelationshipTargetRef(conn)),
        type: conn.type,
        ...(conn.label ? { label: conn.label } : {}),
        direction: resolveDirection(conn),
        ...(conn.ended === true ? { ended: true } : {})
    };
}

/** A copy of the list with the entry at `index` replaced. Out-of-range indexes leave the list unchanged. */
export function replaceConnectionAt(
    connections: TypedRelationship[],
    index: number,
    relationship: TypedRelationship
): TypedRelationship[] {
    if (index < 0 || index >= connections.length) return [...connections];
    return connections.map((conn, i) => (i === index ? relationship : conn));
}
