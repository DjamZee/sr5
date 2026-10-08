import {
  describe, it, expect, vi, afterEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5Combat
} = await import('../modules/system/srcombat.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

// Lancelot (relecture groupée, F3): a chase action checked and spent the actions of the vehicle, absent from the
// combat when only its driver is in it (the common case): nothing was checked nor spent
describe('the fighter who spends the actions of a vehicle test', () => {
  const rigger = {
    isToken: false, id: 'rigger'
  }
  const rover = (controlMode = 'manual') => ({
    isToken: false, id: 'rover', system: {
      controlMode, vehicleOwner: {
        id: 'rigger'
      }
    }
  })
  const setCombat = actorIds => {
    globalThis.game.combat = {
      combatants: actorIds.map((actorId, i) => ({
        id: `c${i}`, actorId, tokenId: `t${i}`, token: {
          actorLink: true
        }
      }))
    }
  }
  afterEach(() => {
    delete globalThis.game.combat
    vi.restoreAllMocks()
  })

  it('is the vehicle when it is in the combat', () => {
    setCombat(['rigger', 'rover'])
    const vehicle = rover()
    expect(SR5Combat.vehicleFighter(vehicle)).toBe(vehicle)
  })

  it('is the driver when only he is in the combat', () => {
    setCombat(['rigger'])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(rigger)
    expect(SR5Combat.vehicleFighter(rover())).toBe(rigger)
    expect(SR5Combat.vehicleFighter(rover('rigging'))).toBe(rigger)
  })

  it('stays the vehicle on autopilot, or when nobody aboard is in the combat', () => {
    setCombat(['rigger'])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(rigger)
    const autopilot = rover('autopilot')
    expect(SR5Combat.vehicleFighter(autopilot)).toBe(autopilot)
    setCombat(['someone'])
    const vehicle = rover()
    expect(SR5Combat.vehicleFighter(vehicle)).toBe(vehicle)
  })
})
