export function markDemandActions(code: string, key: string): string {
  if (!['hero-dark', 'scene-hero', 'telbar'].includes(key)) return code
  return code.replace(/<(?:NuxtLink|a)\b[^>]*>/g, (tag) => {
    if (
      !/\bclass="[^"]*\b(?:btn|sh-btn)\b/.test(tag) ||
      !/:(?:to|href)="action\.href(?: \|\| '#')?"/.test(tag) ||
      tag.includes('data-contact-action')
    )
      return tag
    return tag.replace(
      />$/,
      ` :data-contact-action="/^\\/contact\\/?$/.test(String(action.href)) ? 'demand' : undefined">`
    )
  })
}
