import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"

// config.js writes CONFIG.statusEffects while it is being imported
globalThis.CONFIG ??= {
}
const {
  SR5_CharacterUtility
} = await import("../modules/entities/actors/utilityActor.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  SR5_EffectArea
} = await import("../modules/system/effectArea.js")
const {
  SR5_CombatHelpers
} = await import("../modules/rolls/roll-helpers/combat.js")

// N54 / N65: the sheet shows the prepared environment rows, the roll reads them and takes off what does not count
// on its scene. Both are computed here from the same items, through the real preparation (the itemEffect branch
// of entityActor.js and the update of the rows in utilityActor.js) and the real roll, so they must agree.
const effect = (ownerItem, visibility) => ({
  name: ownerItem || "orphelin", type: "itemEffect", system: {
    type: "areaEffect", ownerItem, customEffects: [{
      category: "environmentalModifiers", target: "system.itemsProperties.environmentalMod.visibility", type: "value", value: visibility, forceAdd: true
    }]
  }
})
const row = () => ({
  value: 0, base: 0, modifiers: []
})

function prepare(items){
  const actor = {
    isToken: false, items,
    system: {
      itemsProperties: {
        environmentalMod: {
          visibility: row(), light: row(), glare: row(), wind: row(), range: row()
        }
      },
      visions: {
        lowLight: {
          isActive: false
        }
      },
    },
  }
  for (const i of items) if (!SR5_EffectArea.isPreparedAreaEffectOffScene(i, actor)) SR5_CharacterUtility.applyCustomEffects(i, actor)
  for (const r of Object.values(actor.system.itemsProperties.environmentalMod)) SR5_EntityHelpers.updateValue(r)
  actor.system.parent = actor
  return actor
}
const roll = (actor, sceneId) => SR5_CombatHelpers.handleEnvironmentalModifiers({
  id: sceneId, getFlag: () => undefined
}, actor.system, true)

describe("the sheet and the roll agree on area effects", () => {
  let saved
  beforeEach(() => {
    saved = globalThis.canvas
    globalThis.canvas = {
      scene: {
        id: "A"
      }
    }
  })
  afterEach(() => {
    globalThis.canvas = saved
  })

  const here = effect("Scene.A.MeasuredTemplate.t1", 2)
  const there = effect("Scene.B.MeasuredTemplate.t2", 1)
  const orphan = effect("", 3)

  it("the sheet leaves the orphan out", () => {
    expect(prepare([here, there, orphan]).system.itemsProperties.environmentalMod.visibility.value).toBe(3)
  })

  it("the roll on scene A counts only the template standing on A", () => {
    expect(roll(prepare([here, there, orphan]), "A")).toBe(roll(prepare([here]), "A"))
  })

  it("the roll on scene B counts only the template standing on B", () => {
    expect(roll(prepare([here, there, orphan]), "B")).toBe(roll(prepare([there]), "B"))
  })

  it("an orphan alone changes neither the sheet nor the roll", () => {
    const actor = prepare([orphan])
    expect(actor.system.itemsProperties.environmentalMod.visibility.value).toBe(0)
    expect(roll(actor, "A")).toBe(roll(prepare([]), "A"))
  })
})
