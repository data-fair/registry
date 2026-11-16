/**
 * Reading the `{ en, fr }` values of a registry artefact (title, description, group).
 *
 * These values are data typed by whoever publishes the artefact, not UI messages: vue-i18n does not
 * read them, and they only exist in English and French. The session language, on the other hand, can be
 * any language offered by simple-directory (de, es, it, pt…).
 *
 * The rule:
 * - a French session (`fr`, `fr-FR`…) reads `fr`, every other session language reads `en`;
 * - when that text is missing or empty, read the other language;
 * - when both are missing, return undefined so the caller falls back on a technical name
 *   (`localized(artefact.title, locale) || artefact.name`).
 *
 * This file is the reference: the UIs of processings and catalogs keep a copy of it (with a link back
 * here) rather than a shared package, the logic being a few lines used by the registry consumers only.
 * Change the rule here first, then in the copies.
 */

/** The content language of `{ en, fr }` values for a session language. */
export type ContentLocale = 'en' | 'fr'

export const contentLocale = (locale: string | undefined): ContentLocale => locale?.startsWith('fr') ? 'fr' : 'en'

/** The text in the content language of the session, else in the other language, else undefined. */
export const localized = (value: unknown, locale: string | undefined): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const v = value as { en?: string, fr?: string }
  return contentLocale(locale) === 'fr' ? (v.fr || v.en || undefined) : (v.en || v.fr || undefined)
}
