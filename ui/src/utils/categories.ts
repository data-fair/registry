export const categoryValues = ['processing', 'catalog', 'application', 'tileset', 'maplibre-style', 'other'] as const
export type Category = typeof categoryValues[number]

export const categoryLabels: Record<Category, { fr: string, en: string }> = {
  processing: { fr: 'Traitement', en: 'Processing' },
  catalog: { fr: 'Catalogue', en: 'Catalog' },
  application: { fr: 'Application', en: 'Application' },
  tileset: { fr: 'Tuiles', en: 'Tileset' },
  'maplibre-style': { fr: 'Style Maplibre', en: 'Maplibre style' },
  other: { fr: 'Autre', en: 'Other' }
}

export const categoryColors: Record<Category, string> = {
  processing: 'blue',
  catalog: 'green',
  application: 'purple',
  tileset: 'teal',
  'maplibre-style': 'orange',
  other: 'grey'
}

export function categoryLabel (cat: string, locale: string): string {
  const entry = categoryLabels[cat as Category]
  if (!entry) return cat
  return locale.startsWith('fr') ? entry.fr : entry.en
}

export function categoryColor (cat: string): string {
  return categoryColors[cat as Category] || 'grey'
}

export function categoryItems (locale: string, filter?: readonly string[]) {
  return categoryValues
    .filter(v => !filter || filter.includes(v))
    .map(v => ({ value: v, title: categoryLabel(v, locale) }))
}
