import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  SR5_RollTestHelper
} = await import('../modules/rolls/roll-test-helper.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  vehiclePilotId
} = await import('../modules/system/rigging-rules.js')

// Arbitrage de DjamZ (08/10, R12) : un véhicule n'a pas de Chance ; son pilote dépense la sienne sur les tests du véhicule,
// à la main, à distance ou plongé, jamais en autopilote. Même chemin que la Chance de l'invocateur (SR5 p. 306) : le
// moniteur de Chance du personnage, et seulement s'il appartient à l'utilisateur qui lance.

const pilot = (isOwner = true, spent = 0) => ({
  type: 'actorPc', isOwner, update: vi.fn(), system: {
    specialAttributes: {
      edge: {
        augmented: {
          value: 4
        }
      }
    },
    conditionMonitors: {
      edge: {
        actual: {
          value: spent, base: spent
        }
      }
    }
  }
})
const vehicle = controlMode => ({
  type: 'actorDrone', id: 'v1', update: vi.fn(), system: {
    controlMode, vehicleOwner: {
      id: 'pc1'
    }
  }
})
const dialog = {
  test: {
    type: 'vehicleTest'
  }
}
let rigger

beforeEach(() => {
  rigger = pilot()
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'pc1' ? rigger : undefined))
  globalThis.game = {
    settings: {
      get: () => ({
      })
    }
  }
})

describe('la Chance du pilote sur les tests de véhicule', () => {
  it('à la main, à distance ou plongé : celle du pilote, jamais celle de l\'autopilote', () => {
    expect(vehiclePilotId(vehicle('manual').system)).toBe('pc1')
    expect(vehiclePilotId(vehicle('remote').system)).toBe('pc1')
    expect(vehiclePilotId(vehicle('rigging').system)).toBe('pc1')
    expect(vehiclePilotId(vehicle('autopilot').system)).toBeNull()
    expect(vehiclePilotId({
      controlMode: 'rigging', vehicleOwner: {
        id: ''
      }
    })).toBeNull()
  })

  it('le pilote plongé dépense son point par le moniteur de Chance', async () => {
    const drone = vehicle('rigging')
    expect(await SR5_RollTestHelper.canUseEdge(drone, dialog)).toBe(true)
    expect(await SR5_RollTestHelper.determineEdgeActor(drone)).toBe(rigger)
    await SR5_RollTestHelper.removeEdgeFromActor({
    }, drone)
    expect(rigger.update).toHaveBeenCalledWith({
      "system.conditionMonitors.edge.actual.base": 1
    })
    expect(drone.update).not.toHaveBeenCalled()
  })

  it('en autopilote, aucune Chance', async () => {
    const drone = vehicle('autopilot')
    expect(await SR5_RollTestHelper.canUseEdge(drone, dialog)).toBe(false)
    expect(SR5_RollTestHelper.edgeCharacter(drone)).toBeNull()
  })

  it('un pilote qui n\'appartient pas à l\'utilisateur, ou à court de Chance, ne prête rien', async () => {
    rigger = pilot(false)
    expect(await SR5_RollTestHelper.canUseEdge(vehicle('manual'), dialog)).toBe(false)
    rigger = pilot(true, 4)
    expect(await SR5_RollTestHelper.canUseEdge(vehicle('manual'), dialog)).toBe(false)
  })
})
