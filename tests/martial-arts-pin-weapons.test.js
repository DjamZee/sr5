import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  canPin
} = await import('../modules/rolls/roll-prepare-case/rollData-Weapon.js')

// N94: Run & Gun p. 125, Pin is for "armes de jet et de trait" only
describe('Pin called shot', () => {
  it('is offered with a throwing weapon, a bow or a crossbow', () => {
    expect(canPin("throwing", "")).toBe(true)
    expect(canPin("bow", "")).toBe(true)
    expect(canPin("heavyCrossbow", "")).toBe(true)
  })
  it('stays offered with arrows and bolts', () => {
    expect(canPin("", "arrow")).toBe(true)
    expect(canPin("", "bolt")).toBe(true)
  })
  it('is refused to firearms and melee weapons', () => {
    expect(canPin("heavyPistol", "regular")).toBe(false)
    expect(canPin("blades", "")).toBe(false)
  })
})
