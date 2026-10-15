import {
  describe, it, expect
} from 'vitest'
import {
  starterKitPlan, STARTER_CREDSTICK_MAX
} from '../modules/system/starter-kit.js'

describe('starting kit of a new player character (R8)', () => {
  it('gives a backpack, a locker and an empty standard credstick to a player character', () => {
    const plan = starterKitPlan('actorPc', [], true)
    expect(plan.map(i => [i.type, i.system.type ?? 'credstick'])).toEqual([
      ['itemStorage', 'backpack'], ['itemStorage', 'stash'], ['itemGear', 'credstick'],
    ])
    const stick = plan[2].system
    expect(stick.isCredstick).toBe(true)
    expect(stick.funds).toEqual({
      value: 0, max: 5000
    })
    expect(STARTER_CREDSTICK_MAX).toBe(5000)
    // Run Faster p. 222: the backpack costs 20¥; SR5 p. 443: the standard credstick 5¥
    expect(plan[0].system.price.base).toBe(20)
    expect(stick.price.base).toBe(5)
  })

  it('gives nothing to the other actors, nor when the setting is off', () => {
    for (const type of ['actorGrunt', 'actorSpirit', 'actorDrone', 'actorSprite', 'actorAgent', 'actorDevice', 'actorStorage']) {
      expect(starterKitPlan(type, [], true)).toEqual([])
    }
    expect(starterKitPlan('actorPc', [], false)).toEqual([])
  })

  it('adds only what the actor lacks', () => {
    const items = [
      {
        type: 'itemStorage', system: {
          type: 'backpack'
        }
      },
      {
        type: 'itemGear', system: {
          isCredstick: true
        }
      },
      {
        type: 'itemGear', system: {
          isCredstick: false
        }
      },
    ]
    expect(starterKitPlan('actorPc', items, true).map(i => i.system.type)).toEqual(['stash'])
    expect(starterKitPlan('actorPc', [...items, {
      type: 'itemStorage', system: {
        type: 'stash'
      }
    }], true)).toEqual([])
  })

  it('names the items with the localized labels', () => {
    const names = starterKitPlan('actorPc', [], true, key => `<${key}>`).map(i => i.name)
    expect(names).toEqual(['<SR5.StarterKit_Backpack>', '<SR5.StarterKit_Locker>', '<SR5.StarterKit_Credstick>'])
  })
})
