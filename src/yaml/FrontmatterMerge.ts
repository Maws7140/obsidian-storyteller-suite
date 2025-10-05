/* Utility to merge new (known) frontmatter with existing frontmatter without
 * destroying unknown user-defined keys.
 *
 * - existingFm: frontmatter read from metadataCache (may be undefined)
 * - nextKnown: sanitized, whitelisted keys we intend to write
 *
 * Returns a new object preserving unknown keys from existingFm and overriding
 * with nextKnown where provided.
 */
export function mergeFrontmatterPreservingUnknown(
  existingFm: Record<string, any> | undefined,
  nextKnown: Record<string, any>
): Record<string, any> {
  // If nothing exists, just use the known set.
  if (!existingFm || typeof existingFm !== 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(nextKnown)) {
      if (v !== undefined) cleaned[k] = v;
    }
    return cleaned;
  }

  // Start with a shallow clone of existing frontmatter to preserve unknowns
  const merged: Record<string, any> = { ...existingFm };

  // Overwrite/insert our known keys
  for (const [k, v] of Object.entries(nextKnown)) {
    if (v === undefined) {
      // If undefined, remove to avoid writing undefined keys
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }

  // Remove Obsidian-injected metadata keys that should never be serialized back
  delete (merged as any).position;

  return merged;
}