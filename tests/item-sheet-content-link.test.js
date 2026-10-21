import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from "node:fs"

// Relecture djamz.17 : les liens @UUID de la fiche d'objet avaient un gris écrit en dur (rgb(221, 221, 221)),
// et un lien cassé (.broken) y prenait le même rouge qu'un lien valide
const less = readFileSync(new URL("../styles/item-sheet.less", import.meta.url), "utf-8")

/** The body of the block opened by `selector`, nested blocks included */
function block(source, selector) {
  const start = source.indexOf(selector)
  if (start < 0) return ""
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++
    if (source[i] === "}" && --depth === 0) return source.slice(start, i)
  }
  return ""
}

describe("@UUID links of the item sheet", () => {
  const links = block(less, "a.content-link, a.inline-roll {")

  it("take the theme's colours, none written out", () => {
    expect(links).toContain("color: var(--sr-ui-border-color)")
    expect(links).toContain("background: var(--sr-text-color-light)")
    expect(links).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}\b/i)
  })

  it("keep a broken link apart: struck through and greyed", () => {
    const broken = block(links, "&.broken {")
    expect(broken).toContain("text-decoration: line-through")
    expect(broken).toMatch(/color: color-mix\(in srgb, var\(--sr-text-color-dark\)/)
  })
})
