import {
  describe, it, expect
} from 'vitest'

// An IC created by script with an empty item list (Actor.create({..., items: []})) skipped the
// creation dialog that adds its base device: no matrix was computed and it attacked with 0 dice.
// _preCreate now adds the base device to any device, drone or agent that has none.

const {
  missingBaseDevice
} = await import('../modules/entities/actors/base-device.js')

describe('base device of an actor created by script', () => {
  it('is added to a device, a drone or an agent without one', () => {
    for (const type of ['actorDevice', 'actorDrone', 'actorAgent']) {
      expect(missingBaseDevice(type, [])).toMatchObject({
        type: 'itemDevice', system: {
          isActive: true, type: 'baseDevice'
        }
      })
    }
  })

  it('is not added twice, nor to other actors', () => {
    expect(missingBaseDevice('actorDevice', [{
      type: 'itemDevice'
    }])).toBeNull()
    expect(missingBaseDevice('actorPc', [])).toBeNull()
    expect(missingBaseDevice('actorSprite', [])).toBeNull()
  })
})
