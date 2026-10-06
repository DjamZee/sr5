import {
  describe, it, expect
} from 'vitest'
import {
  astralReputation, wildReputation, elementalReduction, elementalServices, leashThreshold, testsLeash, resolveLeash,
  wildCallThreshold, wildBanishProgress, wildBanishDrain, domainMagicMultiplier, domainPowerKey,
  stripGMOnlyChanges, GM_ONLY_ACTOR_PATHS
} from '../modules/entities/items/spirit-bonds.js'

describe('GM-only paths (DjamZ ruling, 2026-10-06)', () => {
  const current = {
    system: {
      magic: {
        spiritIndex: 10, wildIndex: 0
      }, isWild: false
    }
  }
  it('refuses a player change of the index, nested or dotted', () => {
    const nested = {
      system: {
        magic: {
          spiritIndex: 0, reagents: 5
        }
      }
    }
    expect(stripGMOnlyChanges(nested, current, GM_ONLY_ACTOR_PATHS)).toEqual(["system.magic.spiritIndex"])
    expect(nested.system.magic).toEqual({
      reagents: 5
    })
    const dotted = {
      "system.isWild": true
    }
    expect(stripGMOnlyChanges(dotted, current, GM_ONLY_ACTOR_PATHS)).toEqual(["system.isWild"])
    expect(dotted).toEqual({
    })
  })
  it('lets through a whole system written back unchanged', () => {
    const same = {
      system: {
        magic: {
          spiritIndex: 10, wildIndex: 0
        }, isWild: false
      }
    }
    expect(stripGMOnlyChanges(same, current, GM_ONLY_ACTOR_PATHS)).toEqual([])
    expect(same.system.magic.spiritIndex).toBe(10)
  })
  it('names the Domain powers in French and English', () => {
    expect(domainPowerKey("Recherche")).toBe("search")
    expect(domainPowerKey("Guard")).toBe("guard")
    expect(domainPowerKey("Peur")).toBe(null)
  })
})

describe('Astral and Wild Reputation (Street Grimoire p. 207, Forbidden Arcana p. 170)', () => {
  it('rises by 1 every 25 points of index', () => {
    expect(astralReputation(0)).toBe(0)
    expect(astralReputation(24)).toBe(0)
    expect(astralReputation(25)).toBe(1)
    expect(astralReputation(74)).toBe(2)
  })
  it('takes the elementalist 6 and the geas as an adjustment, never below 0', () => {
    expect(astralReputation(0, 6)).toBe(6)
    expect(astralReputation(30, -2)).toBe(0)
  })
  it('wild reputation never goes below 0 even with a negative index', () => {
    expect(wildReputation(-40)).toBe(0)
    expect(wildReputation(50)).toBe(2)
  })
})

describe('Elemental trait (Forbidden Arcana p. 175)', () => {
  it('reduces mental attributes by half the Force, rounded down, to a minimum of 1', () => {
    expect(elementalReduction(3, 3)).toBe(1)
    expect(elementalReduction(6, 6)).toBe(3)
    expect(elementalReduction(6, 2)).toBe(1)
    expect(elementalReduction(1, 1)).toBe(0)
  })
  it('adds a service only when at least one was owed', () => {
    expect(elementalServices(0, true)).toBe(0)
    expect(elementalServices(2, true)).toBe(3)
    expect(elementalServices(2, false)).toBe(2)
  })
})

describe('Testing the Leash (Forbidden Arcana p. 176)', () => {
  it('Force 3 tests on 5 hits, Force 6 on 3', () => {
    expect(leashThreshold(3)).toBe(5)
    expect(leashThreshold(6)).toBe(3)
    expect(testsLeash({
      hits: 4, force: 3, services: 2
    })).toBe(false)
    expect(testsLeash({
      hits: 5, force: 3, services: 2
    })).toBe(true)
  })
  it('an elemental or a spirit with no service left never tests', () => {
    expect(testsLeash({
      hits: 6, force: 6, services: 2, isElemental: true
    })).toBe(false)
    expect(testsLeash({
      hits: 6, force: 6, services: 0
    })).toBe(false)
  })
  it('controller net hits are Stun on the spirit', () => {
    expect(resolveLeash({
      controllerHits: 4, spiritHits: 1, force: 4, magic: 5, services: 3
    }))
      .toMatchObject({
        spiritStun: 3, servicesLost: 0, controllerDamage: 0, servicesLeft: 3
      })
  })
  it('spirit net hits erase services on a slack leash', () => {
    expect(resolveLeash({
      controllerHits: 1, spiritHits: 3, force: 4, magic: 5, services: 3
    }))
      .toMatchObject({
        servicesLost: 2, servicesLeft: 1, controllerDamage: 0
      })
  })
  it('a tight leash turns lost services into damage on the controller, Physical above his Magic', () => {
    expect(resolveLeash({
      controllerHits: 1, spiritHits: 3, tight: true, force: 4, magic: 5, services: 3
    }))
      .toMatchObject({
        servicesLost: 0, servicesLeft: 3, controllerDamage: 2, damageType: "stun"
      })
    expect(resolveLeash({
      controllerHits: 0, spiritHits: 1, tight: true, force: 6, magic: 5, services: 3
    }).damageType)
      .toBe("physical")
  })
})

describe('Wild spirits (Forbidden Arcana p. 170-172)', () => {
  it('calling threshold is 1 + Astral Reputation', () => {
    expect(wildCallThreshold(0)).toBe(1)
    expect(wildCallThreshold(3)).toBe(4)
  })
  it('banishing adds net hits until Force x 2', () => {
    expect(wildBanishProgress(0, 3, 4)).toEqual({
      total: 3, dissipated: false
    })
    expect(wildBanishProgress(3, 5, 4)).toEqual({
      total: 8, dissipated: true
    })
  })
  it('drain is the spirit hits, minimum 2, Physical when Force exceeds Magic', () => {
    expect(wildBanishDrain(1, 4, 5)).toEqual({
      value: 2, type: "stun"
    })
    expect(wildBanishDrain(5, 6, 5)).toEqual({
      value: 5, type: "physical"
    })
  })
  it('the Domain trait doubles Magic for Accident, Guard and Search only', () => {
    expect(domainMagicMultiplier("search", true)).toBe(2)
    expect(domainMagicMultiplier("fear", true)).toBe(1)
    expect(domainMagicMultiplier("search", false)).toBe(1)
  })
})
