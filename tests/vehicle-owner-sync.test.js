import {
  describe, it, expect, vi, afterEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  controllerOf, syncsHere, scheduleVehicleOwnerSync, isStillThere, cancelVehicleOwnerSyncs
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
  const live = {
    ...rigger, name: 'Rigger', toObject: () => ({
    })
  }
  const savedActors = globalThis.game?.actors
  afterEach(() => {
    cancelVehicleOwnerSyncs()
    vi.useRealTimers()
    vi.restoreAllMocks()
    globalThis.game.actors = savedActors
  })

  it('several changes in a row send one copy', async () => {
    vi.useFakeTimers()
    const sync = vi.fn()
    scheduleVehicleOwnerSync(live, sync)
    scheduleVehicleOwnerSync(live, sync)
    scheduleVehicleOwnerSync(live, sync)
    await vi.runAllTimersAsync()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith(live)
  })

  it('a controller deleted, or no full document, by the end of the delay is not copied', async () => {
    vi.useFakeTimers()
    globalThis.game.actors = new Map()
    const sync = vi.fn()
    scheduleVehicleOwnerSync(live, sync)
    scheduleVehicleOwnerSync({
      id: 'fake', type: 'actorPc'
    }, sync)
    await vi.runAllTimersAsync()
    expect(sync).not.toHaveBeenCalled()
    expect(isStillThere(live)).toBe(false)
    globalThis.game.actors.set(live.id, live)
    expect(isStillThere(live)).toBe(true)
  })

  it('a copy that fails is reported, not left as an unhandled rejection', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    scheduleVehicleOwnerSync(live, () => {
      throw new TypeError('boom')
    })
    scheduleVehicleOwnerSync({
      ...live, id: 'r2'
    }, () => Promise.reject(new Error('refused')))
    await vi.runAllTimersAsync()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('cancelVehicleOwnerSyncs drops the copies still waiting', async () => {
    vi.useFakeTimers()
    const sync = vi.fn()
    scheduleVehicleOwnerSync(live, sync)
    cancelVehicleOwnerSyncs()
    await vi.runAllTimersAsync()
    expect(sync).not.toHaveBeenCalled()
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
