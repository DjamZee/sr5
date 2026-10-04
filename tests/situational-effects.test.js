import {
  describe, it, expect 
} from "vitest"
import {
  situationalValue, extractSituational, rollAttributes, isRollTestsTarget, SITUATIONAL_PREFIX
} from "../modules/rolls/roll-helpers/situational.js"

const labels = {
  logic: "Logique", intuition: "Intuition", body: "Constitution" 
}

function roll({
  composition = [], modifiers = [], limit = {
  } 
} = {
}){
  return {
    dicePool: {
      composition, modifiers 
    }, limit: {
      modifiers: limit 
    } 
  }
}

describe("situational effects (SR5 p. 462, Chrome Flesh p. 160-172)", () => {
  it("values an effect by its type, and refuses the types that only make sense on the sheet", () => {
    expect(situationalValue({
      type: "value", value: "2" 
    }, {
    })).toBe(2)
    expect(situationalValue({
      type: "rating", multiplier: 2 
    }, {
      itemRating: 3 
    })).toBe(6)
    expect(situationalValue({
      type: "hits" 
    }, {
      hits: 4 
    })).toBe(4)
    expect(situationalValue({
      type: "valueReplace", value: 5 
    }, {
    })).toBeNull()
    expect(situationalValue({
      type: "boolean", value: "true" 
    }, {
    })).toBeNull()
  })

  it("turns the markers left on the sheet into unticked boxes, and takes them out of the pool", () => {
    const effects = [
      {
        source: "Filtre trachéal", value: 2, when: "toxines inhalées", situational: true 
      },
      {
        source: "Solus", value: -1, when: "de nuit", situational: true 
      },
    ]
    const r = roll({
      composition: [{
        type: "linkedAttribute", source: "Constitution", value: 4 
      }, {
        type: `${SITUATIONAL_PREFIX}0`, source: "Filtre trachéal", value: 0 
      }],
      modifiers: [{
        type: "penalty", label: "Blessures", value: -1 
      }, {
        type: `${SITUATIONAL_PREFIX}1`, label: "Solus", value: 0 
      }],
    })
    const {
      offers, always 
    } = extractSituational(r, effects, [])
    expect(offers.map(o => [o.label, o.value, o.kind, o.isMalus])).toEqual([
      ["Filtre trachéal", 2, "dicePool", false],
      ["Solus", -1, "dicePool", true],
    ])
    expect(offers[0].when).toBe("toxines inhalées")
    expect(always).toEqual([])
    // Nothing applied without the box: the pool keeps only what it had
    expect(r.dicePool.composition).toHaveLength(1)
    expect(r.dicePool.modifiers).toEqual([{
      type: "penalty", label: "Blessures", value: -1 
    }])
  })

  it("offers a limit marker as a limit box", () => {
    const r = roll({
      limit: {
        [`${SITUATIONAL_PREFIX}0`]: {
          label: "Articulations", value: 0 
        }, other: {
          label: "x", value: 1 
        } 
      } 
    })
    const {
      offers 
    } = extractSituational(r, [{
      source: "Articulations", value: 1, situational: true 
    }], [])
    expect(offers).toHaveLength(1)
    expect(offers[0].kind).toBe("limit")
    expect(Object.keys(r.limit.modifiers)).toEqual(["other"])
  })

  it("reads the markers of the actor's limit a skill test relies on, once only", () => {
    const effects = [{
      source: "Articulations", value: 1, situational: true
    }]
    const marker = {
      type: `${SITUATIONAL_PREFIX}0`, source: "Articulations", value: 0
    }
    // The skill's limit does not copy the Physical limit's modifiers
    expect(extractSituational(roll(), effects, [], [marker]).offers).toHaveLength(1)
    // A roll that copies them (grenade) does not get the box twice
    const r = roll({
      limit: {
        [marker.type]: {
          label: "Articulations", value: 0
        }
      }
    })
    expect(extractSituational(r, effects, [], [marker]).offers).toHaveLength(1)
    // Counter-test: no marker on the limit, no box
    expect(extractSituational(roll(), effects, [], []).offers).toHaveLength(0)
  })

  it("applies Pushed to tests linked to Logic only (Chrome Flesh p. 167)", () => {
    const pushed = [{
      source: "Pushed", value: 1, scope: "logic", situational: false 
    }]
    const logicRoll = rollAttributes([{
      type: "linkedAttribute", source: "Logique", value: 5 
    }], labels)
    expect(logicRoll).toEqual(["logic"])
    expect(extractSituational(roll(), pushed, logicRoll).always).toEqual([{
      type: "rollTests", label: "Pushed", value: 1 
    }])
    // Counter-test: a Body roll does not get it
    const bodyRoll = rollAttributes([{
      type: "linkedAttribute", source: "Constitution", value: 5 
    }], labels)
    expect(extractSituational(roll(), pushed, bodyRoll).always).toEqual([])
  })

  it("offers 'any roll' everywhere, but only as a box", () => {
    const heat = [{
      source: "Adaptation à la chaleur", value: 2, scope: "anyRoll", situational: true, when: "chaleur" 
    }]
    const {
      offers, always 
    } = extractSituational(roll(), heat, [])
    expect(offers).toHaveLength(1)
    expect(always).toEqual([])
    // Counter-test: an "any roll" effect left permanent is never applied blindly
    expect(extractSituational(roll(), [{
      ...heat[0], situational: false 
    }], []).always).toEqual([])
  })

  it("recognises the roll-wide targets", () => {
    expect(isRollTestsTarget("system.rollTests.logic")).toBe(true)
    expect(isRollTestsTarget("system.skills.gymnastics.test")).toBe(false)
  })
})
