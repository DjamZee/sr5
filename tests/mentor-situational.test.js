import {
  describe, it, expect
} from "vitest"
import {
  situationalReadable, extractSituational, spiritTypeOffers, spiritTypeVisible, withoutSituationalMarkers,
  SITUATIONAL_PREFIX
} from "../modules/rolls/roll-helpers/situational.js"

// Forbidden Arcana p. 90-95: mentor bonuses aim at spell categories, Drain and spirit types
describe("situational effects on magic (Forbidden Arcana p. 90-95)", () => {
  it("offers the box on spell categories, spirit types and Drain", () => {
    expect(situationalReadable("system.skills.spellcasting.spellCategory.combat")).toBe(true)
    expect(situationalReadable("system.skills.ritualSpellcasting.spellCategory.health")).toBe(true)
    expect(situationalReadable("system.skills.alchemy.spellCategory.illusion")).toBe(true)
    expect(situationalReadable("system.skills.summoning.spiritType.air")).toBe(true)
    expect(situationalReadable("system.skills.banishing.spiritType.fire")).toBe(true)
    expect(situationalReadable("system.magic.drainResistance")).toBe(true)
    // Counterspelling reads its category off the target, as one number: no box there
    expect(situationalReadable("system.skills.counterspelling.spellCategory.combat")).toBe(false)
  })

  it("turns a marker on a spell category into a box, as for any skill", () => {
    const effects = [{
      source: "Lune", value: 2, when: "transformation"
    }]
    const rollData = {
      dicePool: {
        composition: [], modifiers: [{
          type: `${SITUATIONAL_PREFIX}0`, label: "Lune", value: 0
        }]
      }, limit: {
        modifiers: {
        }
      }
    }
    const {
      offers 
    } = extractSituational(rollData, effects, [])
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      label: "Lune", value: 2, when: "transformation" 
    })
    expect(rollData.dicePool.modifiers).toHaveLength(0)
  })
})

describe("spirit type boxes (Forbidden Arcana p. 90-95)", () => {
  const effects = [
    {
      source: "Cerf", value: 2 
    },
    {
      source: "Homme vert", value: 2 
    },
  ]
  const spiritTypes = {
    earth: {
      modifiers: [{
        type: "skillRating", source: "Invocation", value: 5 
      }, {
        type: `${SITUATIONAL_PREFIX}0`, source: "Cerf", value: 0 
      }] 
    },
    plant: {
      modifiers: [{
        type: `${SITUATIONAL_PREFIX}1`, source: "Homme vert", value: 0 
      }] 
    },
    air: {
      modifiers: [] 
    },
  }

  it("offers every type's boxes hidden, tagged with their type", () => {
    const offers = spiritTypeOffers(spiritTypes, effects)
    expect(offers.map(o => [o.spiritType, o.label, o.hidden])).toEqual([
      ["earth", "Cerf", true], ["plant", "Homme vert", true],
    ])
  })

  it("drops a marker copied from another item's list", () => {
    expect(spiritTypeOffers({
      earth: {
        modifiers: [{
          type: `${SITUATIONAL_PREFIX}0`, source: "Autre", value: 0 
        }] 
      } 
    }, effects)).toEqual([])
  })

  it("shows the picked type's boxes and unticks the others", () => {
    const offers = spiritTypeOffers(spiritTypes, effects)
    expect(spiritTypeVisible(offers, "earth")).toEqual([])
    expect(offers.map(o => o.hidden)).toEqual([false, true])
    offers[0].checked = true
    expect(spiritTypeVisible(offers, "plant")).toEqual([offers[0].key])
    expect(offers.map(o => o.hidden)).toEqual([true, false])
    expect(offers[0].checked).toBe(false)
  })

  it("leaves the boxes that are not about a spirit type alone", () => {
    const offers = [{
      key: "a", hidden: false 
    }]
    spiritTypeVisible(offers, "air")
    expect(offers[0].hidden).toBe(false)
  })

  it("copies a type's modifiers without their markers", () => {
    expect(withoutSituationalMarkers([{
      type: "wounds" 
    }, {
      type: `${SITUATIONAL_PREFIX}3` 
    }])).toEqual([{
      type: "wounds" 
    }])
  })
})
