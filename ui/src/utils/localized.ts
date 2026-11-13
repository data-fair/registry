// Content stored in the registry (titles, groups, descriptions) only exists in
// English and French, while the session language can be any language offered by
// simple-directory (de, es, it, pt…): those read the English content.
export type ContentLocale = 'en' | 'fr'

export const contentLocale = (locale: string): ContentLocale => locale.startsWith('fr') ? 'fr' : 'en'

// The value in the content language, else in the other one, else undefined so the
// caller can fall back on a technical name.
export const localized = (value: unknown, locale: string): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const v = value as { en?: string, fr?: string }
  return contentLocale(locale) === 'fr' ? (v.fr || v.en || undefined) : (v.en || v.fr || undefined)
}
