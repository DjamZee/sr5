import {
  describe, it, expect
} from 'vitest'
import {
  explosiveDV, effectiveRating, baseRating, chargeOutcome, explosionBackgroundCount, outsideBlast, detonatorFails, dvAtDistance,
} from '../modules/rolls/roll-helpers/explosives.js'
import {
  SR5_CombatHelpers
} from '../modules/rolls/roll-helpers/combat.js'

// An airburst link takes 2 m off per hit when the launcher's wireless is on (SR5 p. 434), 1 m otherwise (p. 183)
describe('scatterMetersPerHit', () => {
  const link = (extra = {
  }) => [{
    name: 'airburstLink', ...extra
  }]
  it('2 m per hit with the link and the wireless on', () => {
    expect(SR5_CombatHelpers.scatterMetersPerHit({
      wirelessTurnedOn: true, accessory: link()
    })).toBe(2)
  })
  it('1 m per hit with the wireless off, without the link, or the link switched off', () => {
    expect(SR5_CombatHelpers.scatterMetersPerHit({
      wirelessTurnedOn: false, accessory: link()
    })).toBe(1)
    expect(SR5_CombatHelpers.scatterMetersPerHit({
      wirelessTurnedOn: true, accessory: []
    })).toBe(1)
    expect(SR5_CombatHelpers.scatterMetersPerHit({
      wirelessTurnedOn: true, accessory: link({
        isActive: false
      })
    })).toBe(1)
  })
})

// Lot 37b: Run & Gun p. 183-208 over SR5 p. 438
describe('the Damage Value of a charge (RG p. 188)', () => {
  it('is the rating times the root of the kilos, rounded up as the table reads', () => {
    expect(explosiveDV(1, 2)).toBe(2)
    expect(explosiveDV(2, 2)).toBe(3)
    expect(explosiveDV(2, 10)).toBe(7)
    expect(explosiveDV(10, 10)).toBe(32)
    expect(explosiveDV(25, 10)).toBe(80)
    expect(explosiveDV(3, 4)).toBe(6)
  })
  it('is nothing without rating or kilos', () => {
    expect(explosiveDV(0, 5)).toBe(0)
    expect(explosiveDV(6, 0)).toBe(0)
  })
})

describe('the effective rating (RG p. 189)', () => {
  it('moves by the Demolitions hits, either way, and the secret change of a homemade lot', () => {
    expect(effectiveRating(9, {
      hits: 2
    })).toBe(11)
    expect(effectiveRating(5, {
      hits: -4
    })).toBe(1)
    expect(effectiveRating(9, {
      offset: -3
    })).toBe(6)
  })
  it('the change is never more than 15, and a rating at 0 does not explode', () => {
    expect(effectiveRating(10, {
      offset: -40
    })).toBe(0)
    expect(effectiveRating(5, {
      offset: 30
    })).toBe(20)
  })
  it('a compound keeps the rating of its table (RG p. 202, RG errata p. 190)', () => {
    expect(baseRating('dynamite', 12)).toBe(3)
    expect(baseRating('plastic', 3)).toBe(6)
    expect(baseRating('plastic', 30)).toBe(25)
    expect(baseRating('nothing', 6)).toBe(0)
  })
})

describe('what a charge does', () => {
  it('placed against its target: DV x2 against it alone, the blast for the others is the plain one', () => {
    const out = chargeOutcome({
      type: 'commercial', rating: 5, kilos: 4, placement: 'placed'
    })
    expect(out.dv).toBe(10)
    expect(out.targetDV).toBe(20)
    expect(out.falloff).toBe(-2)
    expect(out.radius).toBe(5)
    expect(out.ap).toBe(-2)
  })
  it('tamped: x4; a linear cutting charge is always tamped (RG p. 205)', () => {
    expect(chargeOutcome({
      type: 'plastic', rating: 9, kilos: 1, placement: 'tamped'
    }).targetDV).toBe(36)
    expect(chargeOutcome({
      type: 'linearCharge', rating: 6, kilos: 2
    }).multiplier).toBe(4)
  })
  it('directional: -1 per meter, so twice the reach', () => {
    const out = chargeOutcome({
      type: 'commercial', rating: 5, kilos: 4, shape: 'directional'
    })
    expect(out.falloff).toBe(-1)
    expect(out.radius).toBe(10)
  })
  it('a gas leak adds 20P to the blast (RG p. 189)', () => {
    expect(chargeOutcome({
      type: 'commercial', rating: 5, kilos: 1, gasLeak: true
    }).dv).toBe(25)
  })
})

describe('the background count of an explosion (RG p. 190)', () => {
  it('1 from 35P, +1 for every 20 more, 3 at most', () => {
    expect(explosionBackgroundCount(34)).toBe(0)
    expect(explosionBackgroundCount(35)).toBe(1)
    expect(explosionBackgroundCount(40)).toBe(1)
    expect(explosionBackgroundCount(55)).toBe(2)
    expect(explosionBackgroundCount(75)).toBe(3)
    expect(explosionBackgroundCount(200)).toBe(3)
  })
})

describe('blasts and detonators', () => {
  it('a blast of fixed radius reaches no one past it (SR5 p. 437, flashbang 10 m)', () => {
    expect(outsideBlast(10, 10)).toBe(false)
    expect(outsideBlast(11, 10)).toBe(true)
    expect(outsideBlast(30, 0)).toBe(false)
  })
  it('the DV at a distance', () => {
    expect(dvAtDistance(16, -2, 3)).toBe(10)
    expect(dvAtDistance(16, -2, 9)).toBe(0)
  })
  it('a cheap detonator may fail (RG p. 206-207)', () => {
    expect(detonatorFails(1, 2)).toBe(true)
    expect(detonatorFails(1, 3)).toBe(false)
    expect(detonatorFails(2, 1)).toBe(true)
    expect(detonatorFails(2, 2)).toBe(false)
    expect(detonatorFails(3, 1)).toBe(false)
    expect(detonatorFails(0, 1)).toBe(false)
  })
})
