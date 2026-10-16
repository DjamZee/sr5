import {
  describe, it, expect
} from 'vitest'
import {
  netOf, netLands, isLargeTarget, netSizeModifier, netEscaped, netDamage, netEffectOf, NET_EFFECT
} from '../modules/rolls/roll-helpers/net-rules.js'

const weapon = (name, accessory = [], category = "rangedWeapon") => ({
  name, system: {
    category, accessory
  }
})

describe("Nets (Run & Gun p. 25, 28)", () => {
  it("recognises the compendium nets by their name", () => {
    expect(netOf(weapon("Filet standard"))).toEqual({
      xl: false, shock: false
    })
    expect(netOf(weapon("Filet Ares ShockNet"))).toEqual({
      xl: false, shock: true
    })
    expect(netOf(weapon("Lance-filet SA Retiarus XL"))).toEqual({
      xl: true, shock: false
    })
    expect(netOf(weapon("Lance-filet SA Retiarus ShockNet"))?.shock).toBe(true)
    expect(netOf(weapon("Net Gun XL"))?.xl).toBe(true)
  })

  it("leaves the other weapons alone, and a melee weapon", () => {
    expect(netOf(weapon("Ares Predator V"))).toBeNull()
    expect(netOf(weapon("Cabinet de curiosités"))).toBeNull()
    expect(netOf(weapon("Filet", [], "meleeWeapon"))).toBeNull()
  })

  it("follows the traits put on any weapon", () => {
    expect(netOf(weapon("Lanceur maison", [{
      name: "net"
    }, {
      name: "shockNet"
    }]))).toEqual({
      xl: false, shock: true
    })
  })

  it("lands on a hit, a graze included, not on a miss", () => {
    expect(netLands(2)).toBe(true)
    expect(netLands(0)).toBe(true)
    expect(netLands(-1)).toBe(false)
  })

  it("an XL net hinders a normal target, a standard net helps a troll", () => {
    expect(netSizeModifier(true, false)).toBe(-2)
    expect(netSizeModifier(false, true)).toBe(2)
    expect(netSizeModifier(false, false)).toBe(0)
    expect(netSizeModifier(true, true)).toBe(0)
    expect(isLargeTarget({
      system: {
        biography: {
          metatype: "troll"
        }
      }
    })).toBe(true)
    expect(isLargeTarget({
      system: {
        biography: {
          metatype: "ork"
        }
      }
    })).toBe(false)
  })

  it("needs as many hits as the threshold, and at least one", () => {
    expect(netEscaped(2, 2)).toBe(true)
    expect(netEscaped(1, 2)).toBe(false)
    expect(netEscaped(0, 0)).toBe(false)
    expect(netEscaped(1, 0)).toBe(true)
  })

  it("deals no damage without DV, and on a graze only an electric charge", () => {
    expect(netDamage({
      base: 0, netHits: 3, electric: false
    })).toBe(0)
    expect(netDamage({
      base: 4, netHits: 2, electric: false
    })).toBe(6)
    expect(netDamage({
      base: 4, netHits: 0, electric: false
    })).toBe(0)
    expect(netDamage({
      base: 6, netHits: 0, electric: true
    })).toBe(6)
  })

  it("finds the net an actor is caught in", () => {
    const net = {
      type: "itemEffect", system: {
        type: NET_EFFECT, value: 2
      }
    }
    expect(netEffectOf({
      items: [net]
    })).toBe(net)
    expect(netEffectOf({
      items: []
    })).toBeNull()
  })
})
