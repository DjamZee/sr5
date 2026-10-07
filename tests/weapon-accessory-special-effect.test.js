import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'fs'
import {
  SR5
} from '../modules/config.js'
import {
  WEAPON_ACCESSORY_CATALOG
} from '../modules/data/weaponAccessoryCatalog.js'

const readLang = path => {
  const text = readFileSync(path, 'utf8')
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
}
const fr = readLang('lang/fr.json')
const en = readLang('lang/en.json')

//An accessory made by hand (a flashlight) had no way to carry weaponAccessory.specialEffect (Ulrique, Victorine)
describe("the special effect of a weapon accessory, chosen on its sheet", () => {
  it("offers every effect the catalog gives its accessories", () => {
    const used = new Set(Object.values(WEAPON_ACCESSORY_CATALOG).flatMap(a => (a.systemEffects ?? []).map(e => e.value)))
    for (const effect of used) expect(SR5.weaponAccessorySpecialEffects).toHaveProperty(effect)
  })

  it("each choice has a label in French and in English", () => {
    for (const label of Object.values(SR5.weaponAccessorySpecialEffects)){
      expect(fr[label]).toBeTruthy()
      expect(en[label]).toBeTruthy()
    }
  })

  it("the sheet shows the selector for an accessory only", () => {
    const stat = readFileSync('templates/items/blocks/weapon/weapon-stat.hbs', 'utf8')
    expect(stat).toMatch(/\{\{#ife system\.category "weaponAccessory"\}\}\s*<!--[^>]*-->\s*\{\{> systems\/sr5\/templates\/items\/_partial\/editable\/weapon\/specialEffect-edit\.hbs\}\}/)
    const partial = readFileSync('templates/items/_partial/editable/weapon/specialEffect-edit.hbs', 'utf8')
    expect(partial).toContain('name="system.weaponAccessory.specialEffect"')
  })
})
