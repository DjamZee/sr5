import {
  describe, it, expect
} from 'vitest'
import {
  consoleRunsSwarm, swarmNumber, swarmEligible, swarmMembers, swarmBonus, swarmProfile, swarmAttributeDelta,
  swarmAutosoftDeltas, swarmState, autosoftKey
} from '../modules/system/swarm-rules.js'

// Drone swarms (Rigger 5.0 p. 35): lot R14 of the rigging plan.

const swarmProgram = (active = true) => ({
  type: 'itemProgram', system: {
    type: 'swarm', isActive: active
  }
})

const drone = (id, {
  owner = 'rigger', swarm = 1, slaved = true, damage = 0, matrixDamage = 0
} = {
}) => ({
  id, system: {
    vehicleOwner: {
      id: owner
    }, slaved, swarm, conditionMonitors: {
      condition: {
        value: 8, actual: {
          value: damage
        }
      }, matrix: {
        value: 9, actual: {
          value: matrixDamage
        }
      }
    }
  }
})

const flySpy = (values = {
}, autosofts = []) => ({
  values: {
    pilot: 3, sensor: 3, handling: 4, speed: 3, acceleration: 2, handlingOffRoad: 0, speedOffRoad: 0, accelerationOffRoad: 0, ...values
  }, autosofts
})

describe('the Swarm program and the members (Rigger 5.0 p. 35)', () => {
  it('runs on the console when active', () => {
    expect(consoleRunsSwarm([swarmProgram()])).toBe(true)
    expect(consoleRunsSwarm([swarmProgram(false)])).toBe(false)
    expect(consoleRunsSwarm([])).toBe(false)
  })

  it('a drone belongs to a swarm by its number, slaved and in working order', () => {
    expect(swarmNumber({
      swarm: 2
    })).toBe(2)
    expect(swarmNumber({
      swarm: 0
    })).toBe(0)
    expect(swarmEligible(drone('a').system)).toBe(true)
    expect(swarmEligible(drone('a', {
      slaved: false
    }).system)).toBe(false)
    expect(swarmEligible(drone('a', {
      damage: 8
    }).system)).toBe(false)
    expect(swarmEligible(drone('a', {
      matrixDamage: 9
    }).system)).toBe(false)
    expect(swarmEligible(drone('a', {
      owner: ''
    }).system)).toBe(false)
  })

  it('the members: same rigger, same number, a destroyed drone left out', () => {
    const a = drone('a'), b = drone('b'), c = drone('c', {
        damage: 8
      }), d = drone('d', {
        swarm: 2
      }), e = drone('e', {
        owner: 'other'
      })
    expect(swarmMembers(a.system, [a, b, c, d, e, b]).map(m => m.id)).toEqual(['a', 'b'])
    expect(swarmMembers(c.system, [a, b, c])).toEqual([])
  })

  it('the bonus is the number of drones minus one', () => {
    expect(swarmBonus(3)).toBe(2)
    expect(swarmBonus(1)).toBe(0)
    expect(swarmBonus(0)).toBe(0)
  })
})

describe('the swarm\'s ratings (Rigger 5.0 p. 35)', () => {
  it('no swarm under two drones', () => {
    expect(swarmProfile([flySpy()])).toBeNull()
  })

  it('Autopilot and Sensor at the highest, the console\'s Device Rating counting for the Autopilot', () => {
    const profile = swarmProfile([flySpy({
      pilot: 2, sensor: 2
    }), flySpy({
      pilot: 4, sensor: 3
    })], {
      deviceRating: 3
    })
    expect(profile.values.pilot).toBe(4)
    expect(profile.values.sensor).toBe(3)
    expect(swarmProfile([flySpy({
      pilot: 2
    }), flySpy({
      pilot: 3
    })], {
      deviceRating: 5
    }).values.pilot).toBe(5)
  })

  it('Handling, Speed and Acceleration at the lowest; an off-road rating no drone has is left alone', () => {
    const profile = swarmProfile([flySpy({
      handling: 4, speed: 3, acceleration: 2
    }), flySpy({
      handling: 3, speed: 4, acceleration: 1, speedOffRoad: 2
    })])
    expect(profile.values).toMatchObject({
      handling: 3, speed: 3, acceleration: 1, speedOffRoad: 2
    })
    expect('handlingOffRoad' in profile.values).toBe(false)
    expect(swarmAttributeDelta(profile, 'handling', 4)).toBe(-1)
    expect(swarmAttributeDelta(profile, 'pilot', 3)).toBe(0)
    expect(swarmAttributeDelta(profile, 'handlingOffRoad', 0)).toBe(0)
    expect(swarmAttributeDelta(profile, 'speedOffRoad', 0)).toBe(0)
    expect(swarmAttributeDelta(null, 'handling', 4)).toBe(0)
  })

  it('each autosoft at its highest rating among the drones and the console', () => {
    const clearsight = (rating, source) => ({
      name: 'Clearsight', model: '', rating, source
    })
    const profile = swarmProfile([flySpy({
    }, [clearsight(2, 'a')]), flySpy({
    }, [clearsight(3, 'b')])], {
      autosofts: [clearsight(1, 'rcc'), {
        name: 'Evasion', model: '', rating: 4, source: 'rcc-evasion'
      }]
    })
    expect(profile.autosofts.clearsight).toEqual({
      rating: 3, source: 'b'
    })
    expect(profile.autosofts.evasion.rating).toBe(4)
    // What a drone running Clearsight 2 and no Evasion gets from the swarm
    expect(swarmAutosoftDeltas(profile, {
      clearsight: 2
    })).toEqual([{
      key: 'clearsight', source: 'b', delta: 1
    }, {
      key: 'evasion', source: 'rcc-evasion', delta: 4
    }])
    // An autosoft that does not fit the drone (another model) is left out
    expect(swarmAutosoftDeltas(profile, {
    }, s => s !== 'rcc-evasion').map(d => d.key)).toEqual(['clearsight'])
  })

  it('an autosoft [Model] or [Weapon] is told apart by its model', () => {
    expect(autosoftKey({
      name: 'Targeting', model: 'Ares Alpha'
    })).toBe('targeting|ares alpha')
    expect(autosoftKey({
      name: 'Clearsight'
    })).toBe('clearsight')
  })
})

describe('the swarm state and the loss of a drone', () => {
  const rcc = [swarmProgram()]

  it('active with the program and two drones at least', () => {
    const a = drone('a'), b = drone('b'), c = drone('c')
    const members = swarmMembers(a.system, [a, b, c])
    expect(swarmState(a.system, members, rcc)).toMatchObject({
      number: 1, active: true, count: 3, bonus: 2, memberIds: ['a', 'b', 'c']
    })
  })

  it('three Fly-Spy, one destroyed: two drones left, +1', () => {
    const a = drone('a'), b = drone('b'), c = drone('c', {
      damage: 8
    })
    const members = swarmMembers(a.system, [a, b, c])
    expect(swarmState(a.system, members, rcc)).toMatchObject({
      active: true, count: 2, bonus: 1
    })
    expect(swarmProfile([flySpy({
      speed: 4
    }), flySpy({
      speed: 5
    })]).values.speed).toBe(4)
  })

  it('inactive: no program, a drone alone, a wrecked drone', () => {
    const a = drone('a'), b = drone('b', {
      damage: 8
    })
    expect(swarmState(a.system, swarmMembers(a.system, [a, drone('x')]), [])).toMatchObject({
      active: false, reason: 'noProgram'
    })
    expect(swarmState(a.system, swarmMembers(a.system, [a, b]), rcc)).toMatchObject({
      active: false, reason: 'alone', count: 1
    })
    expect(swarmState(b.system, [], rcc)).toMatchObject({
      active: false, reason: 'notMember'
    })
    expect(swarmState(drone('z', {
      swarm: 0
    }).system, [], rcc)).toMatchObject({
      active: false, reason: '', number: 0
    })
  })
})
