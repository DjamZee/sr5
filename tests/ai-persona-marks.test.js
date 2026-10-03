import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

globalThis.ui = {
  notifications: {
    info: vi.fn(), warn: vi.fn()
  }
}

const {
  SR5_MarkHelpers
} = await import('../modules/rolls/roll-helpers/mark.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  checkTargetMarks
} = await import('../modules/rolls/roll-prepare-case/rollData-MatrixAction.js')
const {
  sr5HookPersonaMarks
} = await import('../modules/hooks/item.js')
const {
  sr5HookPreUpdateActor, sr5HookUpdateActor
} = await import('../modules/hooks/actor.js')

/** A document whose update merges the flattened changes the way Foundry does */
function documentWith(data) {
  const doc = {
    ...data,
    update: vi.fn(async changes => {
      for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(doc, path, value)
    }),
  }
  doc._source = doc
  return doc
}

let ai, hacker, deck, actors
beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true, id: 'gm'
  }
  // The hacker's deck keeps track of what its owner has marked
  deck = documentWith({
    type: 'itemDevice', name: 'Deck', system: {
      isActive: true, markedItems: []
    }
  })
  hacker = {
    id: 'hacker', name: 'Hackeuse', items: [deck], system: {
      matrix: {
        deviceType: 'cyberdeck'
      }
    }
  }
  ai = documentWith({
    id: 'ai', uuid: 'Actor.ai', name: 'IA', documentName: 'Actor', type: 'actorPc', items: [],
    system: {
      activeSpecialAttribute: 'depth', matrix: {
        marks: []
      }
    },
  })
  actors = {
    ai, hacker
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => actors[id])
  globalThis.fromUuid = vi.fn(async uuid => uuid === ai.uuid ? ai : null)
})

describe('Marks on the persona of an AI without a device (Data Trails p. 157)', () => {
  it('are placed on the persona and followed on the hacker deck', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 1)
    await SR5_MarkHelpers.markItem('ai', 'hacker', 1)
    expect(ai.system.matrix.marks).toEqual([{
      ownerId: 'hacker', value: 2, ownerName: 'Hackeuse', watchdog: false
    }])
    expect(deck.system.markedItems).toEqual([{
      uuid: 'Actor.ai', value: 2, itemName: 'IA', itemOwner: 'IA'
    }])
  })

  it('never go beyond three', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
    await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
    expect(ai.system.matrix.marks[0].value).toBe(3)
  })

  it('open the actions that need them', async () => {
    ai.system.matrix.marks = [{
      ownerId: 'hacker', value: 2
    }]
    ui.notifications.info = vi.fn()
    game.user.targets = new Set([{
      actor: ai
    }])
    const rollData = {
      owner: {
        speakerId: 'hacker'
      }, target: {
      }
    }
    expect(await checkTargetMarks(rollData, {
      neededMarks: 2
    }, hacker)).toBe(true)
    expect(await checkTargetMarks(rollData, {
      neededMarks: 3
    }, hacker)).toBe(false)
  })

  it('go away when the hacker reboots', async () => {
    ai.system.matrix.marks = [{
      ownerId: 'hacker', value: 2
    }, {
      ownerId: 'other', value: 1
    }]
    await SR5_ActorHelper.deleteMarksOnActor({
      matrix: {
        markedItems: [{
          uuid: 'Actor.ai'
        }]
      }
    }, 'hacker')
    expect(ai.system.matrix.marks).toEqual([{
      ownerId: 'other', value: 1
    }])
  })

  it('go away, with their trace on the deck, when the AI loads onto a device', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
    const device = {
      type: 'itemDevice', parent: ai, system: {
        isActive: true
      }
    }
    await sr5HookPersonaMarks(device, 'gm')
    expect(ai.system.matrix.marks).toEqual([])
    expect(deck.system.markedItems).toEqual([])
  })

  it('stay when someone else made the change, or the device is off', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
    await sr5HookPersonaMarks({
      type: 'itemDevice', parent: ai, system: {
        isActive: true
      }
    }, 'player')
    await sr5HookPersonaMarks({
      type: 'itemDevice', parent: ai, system: {
        isActive: false
      }
    }, 'gm')
    expect(ai.system.matrix.marks).toHaveLength(1)
  })
})

describe('Marks on a character with a device stay as they were', () => {
  it('are placed on the active device, not on the actor', async () => {
    const device = documentWith({
      type: 'itemDevice', uuid: 'Actor.pc.Item.d', name: 'Commlink', system: {
        isActive: true, marks: []
      }
    })
    const pc = documentWith({
      id: 'pc', name: 'PJ', type: 'actorPc', items: [device], system: {
        activeSpecialAttribute: 'magic', matrix: {
          marks: [], deviceType: 'commlink'
        }
      }
    })
    device.parent = pc
    device.actor = pc
    actors.pc = pc
    globalThis.fromUuid = vi.fn(async uuid => uuid === device.uuid ? device : null)
    await SR5_MarkHelpers.markItem('pc', 'hacker', 1)
    expect(device.system.marks).toEqual([{
      ownerId: 'hacker', value: 1, ownerName: 'Hackeuse', watchdog: false
    }])
    expect(pc.update).not.toHaveBeenCalled()
    expect(deck.system.markedItems).toEqual([{
      uuid: 'Actor.pc.Item.d', value: 1, itemName: 'Commlink', itemOwner: 'PJ'
    }])
  })

  it('loading a device on a character who is not an AI touches nothing', async () => {
    const pc = documentWith({
      id: 'pc', type: 'actorPc', items: [], system: {
        activeSpecialAttribute: 'magic', matrix: {
          marks: [{
            ownerId: 'hacker', value: 1
          }]
        }
      }
    })
    await sr5HookPersonaMarks({
      type: 'itemDevice', parent: pc, system: {
        isActive: true
      }
    }, 'gm')
    expect(pc.update).not.toHaveBeenCalled()
  })
})

describe('An AI on a device never keeps marks on its persona (Data Trails p. 157-158)', () => {
  function onDevice() {
    ai.items = [{
      type: 'itemDevice', system: {
        isActive: true
      }
    }]
  }

  it('drops the device marks an update copies from the prepared data', () => {
    onDevice()
    const changes = {
      system: {
        matrix: {
          marks: [{
            ownerId: 'hacker', value: 2
          }], overwatchScore: 3
        }
      }
    }
    sr5HookPreUpdateActor(ai, changes)
    expect(changes.system.matrix).toEqual({
      marks: [], overwatchScore: 3
    })
  })

  it('leaves the update of an AI without a device, or of any other character, as it is', () => {
    const marks = [{
      ownerId: 'hacker', value: 2
    }]
    const changes = {
      system: {
        matrix: {
          marks
        }
      }
    }
    sr5HookPreUpdateActor(ai, changes)
    expect(changes.system.matrix.marks).toBe(marks)
    const pc = {
      type: 'actorPc', items: [{
        type: 'itemDevice', system: {
          isActive: true
        }
      }], system: {
        activeSpecialAttribute: 'magic'
      }
    }
    sr5HookPreUpdateActor(pc, changes)
    expect(changes.system.matrix.marks).toBe(marks)
  })

  it('clears the persona when the sheet loads the AI onto a device', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 2)
    onDevice()
    ai.testUserPermission = () => false
    await sr5HookUpdateActor(ai, {
      items: []
    }, {
    }, 'gm')
    expect(ai.system.matrix.marks).toEqual([])
    expect(deck.system.markedItems).toEqual([])
  })
})

describe('Clearing the persona leaves the marks on its devices alone', () => {
  it('forgets the persona on the hacker deck, not the device of the same actor', async () => {
    await SR5_MarkHelpers.markItem('ai', 'hacker', 1)
    deck.system.markedItems.unshift({
      uuid: 'Actor.ai.Item.dev', value: 1, itemName: 'Commlink', itemOwner: 'IA'
    })
    await SR5_MarkHelpers.clearPersonaMarks(ai)
    expect(deck.system.markedItems.map(m => m.uuid)).toEqual(['Actor.ai.Item.dev'])
  })
})
