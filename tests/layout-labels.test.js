import {
  describe, it, expect, beforeAll
} from "vitest"
import {
  readFileSync
} from "node:fs"
import {
  getDefaultLayout, layoutLabel
} from "../modules/interface/default-layout.js"

// Lot 34: the default panels and tabs keep their English names as identifiers
// (saved in the actors' layouts) and only show a translated name.
describe("layoutLabel", () => {
  beforeAll(() => {
    globalThis.game ??= {
    }
    globalThis.game.i18n = {
      localize: key => `t:${key}`
    }
  })

  it("translates every default panel and tab, and the key exists in fr and en", () => {
    const fr = JSON.parse(readFileSync("lang/fr.json", "utf8"))
    const en = JSON.parse(readFileSync("lang/en.json", "utf8"))
    const types = ['SR5ActorSheet', 'SR5GruntSheet', 'SR5SpiritSheet', 'SR5DroneSheet', 'SR5SpriteSheet',
      'SR5AppareilSheet', 'SR5AgentSheet', 'SR5StorageSheet']
    for (const type of types) {
      for (const panel of getDefaultLayout(type).panels) {
        for (const entry of [panel, ...panel.tabs]) {
          const key = `SR5.SheetConfig.Default.${entry.label}`
          expect(layoutLabel(entry)).toBe(`t:${key}`)
          expect(fr[key], key).toBeTruthy()
          expect(en[key], key).toBeTruthy()
        }
      }
    }
  })

  it("leaves the identifier untouched", () => {
    const layout = getDefaultLayout('SR5ActorSheet')
    expect(layout.panels.map(p => p.label)).toEqual(['SIDEBAR', 'MAIN'])
    expect(layout.panels[1].tabs.some(t => t.label === 'Bio')).toBe(true)
  })

  it("shows a name the GM typed as written", () => {
    expect(layoutLabel({
      id: 'default-3', label: 'Mon matos'
    })).toBe('Mon matos')
    expect(layoutLabel({
      id: 'aB3dE5', label: 'Gear'
    })).toBe('Gear')
    expect(layoutLabel({
      id: 'aB3dE5', label: ''
    })).toBe('')
  })
})
