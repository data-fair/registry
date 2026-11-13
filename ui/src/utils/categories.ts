export const categoryValues = ['processing', 'catalog', 'application', 'skill', 'tileset', 'maplibre-style', 'other'] as const
export type Category = typeof categoryValues[number]

export const categoryLabels: Record<Category, { en: string, fr: string }> = {
  processing: { en: 'Processing', fr: 'Traitement' },
  catalog: { en: 'Catalog', fr: 'Catalogue' },
  application: { en: 'Application', fr: 'Application' },
  skill: { en: 'Agent skill', fr: 'Compétence d\'agent' },
  tileset: { en: 'Tileset', fr: 'Tuiles' },
  'maplibre-style': { en: 'Maplibre style', fr: 'Style Maplibre' },
  other: { en: 'Other', fr: 'Autre' }
}

export const categoryColors: Record<Category, string> = {
  processing: 'blue',
  catalog: 'green',
  application: 'purple',
  skill: 'pink',
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
