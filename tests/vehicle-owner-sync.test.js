import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  controllerOf, syncsHere, scheduleVehicleOwnerSync
} from '../modules/entities/actors/vehicle-owner-sync.js'

// The copy of the rigger a drone carries follows the rigger's items, not only the edits of the sheet (lot R4, Blanche)

const rigger = {
  documentName: 'Actor', type: 'actorPc', id: 'r1'
}

describe('controllerOf', () => {
  it('finds the rigger behind an item of his', () => {
    expect(controllerOf({
      documentName: 'Item', parent: rigger
    })).toBe(rigger)
    expect(controllerOf(rigger)).toBe(rigger)
    expect(controllerOf({
      documentName: 'Actor', type: 'actorGrunt'
    })?.type).toBe('actorGrunt')
  })
  it('leaves a drone, a world item and a spirit alone (no loop: the copy written on the drone sends nothing back)', () => {
    expect(controllerOf({
      documentName: 'Actor', type: 'actorDrone'
    })).toBeNull()
    expect(controllerOf({
      documentName: 'Item', parent: null
    })).toBeNull()
    expect(controllerOf({
      documentName: 'Item', parent: {
        type: 'actorSpirit'
      }
    })).toBeNull()
  })
})

describe('syncsHere', () => {
  const gm = {
    id: 'gm'
  }, player = {
    id: 'p'
  }
  it('the active gamemaster alone copies, whoever made the change', () => {
    expect(syncsHere({
      activeGM: gm
    }, gm, 'p')).toBe(true)
    expect(syncsHere({
      activeGM: gm
    }, player, 'p')).toBe(false)
  })
  it('with no gamemaster connected, the user who made the change', () => {
    expect(syncsHere({
      activeGM: null
    }, player, 'p')).toBe(true)
    expect(syncsHere({
      activeGM: null
    }, player, 'other')).toBe(false)
  })
})

describe('scheduleVehicleOwnerSync', () => {
  it('several changes in a row send one copy', () => {
    vi.useFakeTimers()
    const sync = vi.fn()
    scheduleVehicleOwnerSync(rigger, sync)
    scheduleVehicleOwnerSync(rigger, sync)
    scheduleVehicleOwnerSync(rigger, sync)
    vi.runAllTimers()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith(rigger)
    vi.useRealTimers()
  })
})

describe('hooks', () => {
  const item = readFileSync(new URL('../modules/hooks/item.js', import.meta.url), 'utf8')
  const actor = readFileSync(new URL('../modules/hooks/actor.js', import.meta.url), 'utf8')
  it('create, update and deleteItem follow the controller', () => {
    for (const hook of ['sr5HookCreateItem', 'sr5HookUpdateItem', 'sr5HookDeleteItem']) {
      const body = item.slice(item.indexOf(`export async function ${hook}`)).split('\n').slice(0, 3).join('\n')
      expect(body).toContain('followController(')
    }
  })
  it('updateActor copies through the same single client', () => {
    expect(actor).toMatch(/controllerOf\(document\) && syncsHere\(game\.users, game\.user, userId\)/)
  })
})
