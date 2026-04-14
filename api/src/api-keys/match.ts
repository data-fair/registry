/**
 * Check that an artefact name matches an upload key's allowedNames scope.
 *
 * Patterns are either an exact name (`"terrain-france"`) or a prefix ending
 * in `*` (`"terrain-*"`, `"@koumoul/*"`). No mid-string wildcards, no regex.
 *
 * An empty or missing list means the key is unrestricted.
 */
export const matchArtefactName = (name: string, allowedNames: string[] | undefined): boolean => {
  if (!allowedNames || allowedNames.length === 0) return true
  for (const pattern of allowedNames) {
    if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) return true
    } else if (name === pattern) {
      return true
    }
  }
  return false
}
