import {
  describe, it, expect
} from 'vitest'
import {
  isRecoilCarriedOver, buildsProgressiveRecoil
} from '../modules/rolls/roll-helpers/recoil.js'

// N37: a bow or a thrown weapon has no firing mode and fires no rounds
describe('which firing modes build progressive recoil (SR5 p. 177-180)', () => {
  it('builds for the firearm modes', () => {
    for (let mode of ["SA", "BF", "FA", "SB", "LB", "FAc"]) expect(buildsProgressiveRecoil(mode)).toBe(true)
  })
  it('builds none for single-shot and suppressive fire', () => {
    expect(buildsProgressiveRecoil("SS")).toBe(false)
    expect(buildsProgressiveRecoil("SF")).toBe(false)
  })
  it('builds none for a weapon with no firing mode', () => {
    expect(buildsProgressiveRecoil("")).toBe(false)
    expect(buildsProgressiveRecoil(undefined)).toBe(false)
  })
})

const linkedActor = {
  id: "a1", isToken: false, token: null
}
const tokenActor = {
  id: "a1", isToken: true, token: {
    id: "t2"
  }
}

describe('progressive recoil carries over only in combat (SR5 p. 178)', () => {
  it('does not carry over outside any combat', () => {
    expect(isRecoilCarriedOver(linkedActor, null)).toBe(false)
    expect(isRecoilCarriedOver(linkedActor, undefined)).toBe(false)
  })

  it('does not carry over when the actor is not a combatant', () => {
    expect(isRecoilCarriedOver(linkedActor, {
      combatants: [{
        actorId: "other", tokenId: "t9"
      }]
    })).toBe(false)
  })

  it('carries over for a linked actor in the combat', () => {
    expect(isRecoilCarriedOver(linkedActor, {
      combatants: [{
        actorId: "a1", tokenId: "t1"
      }]
    })).toBe(true)
  })

  it('leaves out the base actor of an unlinked combatant token', () => {
    expect(isRecoilCarriedOver(linkedActor, {
      combatants: [{
        actorId: "a1", tokenId: "t1", token: {
          actorLink: false
        }
      }]
    })).toBe(false)
    expect(isRecoilCarriedOver(linkedActor, {
      combatants: [{
        actorId: "a1", tokenId: "t1", token: {
          actorLink: true
        }
      }]
    })).toBe(true)
  })

  it('matches an unlinked token actor by its token, not its base actor', () => {
    expect(isRecoilCarriedOver(tokenActor, {
      combatants: [{
        actorId: "a1", tokenId: "t1"
      }]
    })).toBe(false)
    expect(isRecoilCarriedOver(tokenActor, {
      combatants: [{
        actorId: "a1", tokenId: "t2"
      }]
    })).toBe(true)
  })
})
