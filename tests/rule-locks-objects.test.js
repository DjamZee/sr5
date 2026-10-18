import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// config.js writes into CONFIG at import time, and the sheet builds on Foundry's actor sheet
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  globalThis.foundry.applications.sheets ??= {
    ActorSheetV2: class {
      _onRender(){}
    }
  }
})

const {
  ActorSheetSR5
} = await import('../modules/entities/actors/baseSheet.js')
const {
  SR5_SocketHandler
} = await import('../modules/socket.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5Conceal
} = await import('../modules/interface/conceal.js')
const {
  SR5Pickpocket
} = await import('../modules/interface/pickpocket.js')
const {
  SR5StorageLock
} = await import('../modules/interface/storage-lock-actions.js')
const {
  SR5_GrappleHelpers
} = await import('../modules/rolls/roll-helpers/grapple.js')
const {
  SR5DrugDesigner, canDesignDrug, canOfferDrugDesign
} = await import('../modules/interface/drug-designer.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

// B13, lot 5 (PLAN-AUTOMATISATION-LEGERE.md, family 7 "objects"): each site keeps its test, only its exit goes
// through refuseByRule. Book: refused as before. Lifted: the action goes on, and the GM is told (a whisper asked of
// the active GM from a player's browser, a notification when the site runs in the GM's own browser)

let settings, emits, dialogResult, rendered
// Waits for the dynamic imports the code under test starts (not a fixed delay, which a loaded machine can outlast)
const flush = async () => {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 0))
}
const lift = (boxes = {
  objects: false
}) => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), ...boxes
  }
}
const whispered = () => emits.filter(([type]) => type === 'ruleLockWhisper').map(([, data]) => data.key)
const asPlayer = () => {
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse'
  }
}
const asGM = () => {
  globalThis.game.user = {
    id: 'gm', isGM: true, name: 'MJ'
  }
}

beforeEach(() => {
  resetWhispers()
  // A world migrated to the book
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'),
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.i18n = {
    localize: k => k, format: k => k, has: () => true
  }
  asPlayer()
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }, get: () => null
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  emits = []
  vi.spyOn(SR5_SocketHandler, 'emitForGM').mockImplementation(async (type, data) => {
    emits.push([type, data])
  })
  rendered = []
  dialogResult = null
  globalThis.foundry.applications.handlebars = {
    renderTemplate: vi.fn(async (path, data) => {
      rendered.push(data)
      return ''
    })
  }
  globalThis.foundry.applications.api.DialogV2 = {
    wait: vi.fn(async () => dialogResult)
  }
  globalThis.ChatMessage = {
    create: vi.fn(async () => ({
    })), getSpeaker: () => ({
    }), getWhisperRecipients: () => []
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.users
  delete globalThis.ChatMessage
  delete globalThis.foundry.applications.handlebars
  delete globalThis.foundry.applications.api.DialogV2
})

// An actor's items as Foundry hands them: an array with get(), of documents with toObject()
const collection = data => {
  const items = data.map(i => ({
    ...i, toObject: () => i
  }))
  return Object.assign(items, {
    get: id => items.find(i => i.id === id)
  })
}

describe('B13 lot 5, putting gear into a storage', () => {
  const putIn = async (actor, storageId) => {
    const sheet = Object.create(ActorSheetSR5.prototype)
    sheet.actor = actor
    await sheet._onStoragePutIn({
      preventDefault(){}, currentTarget: {
        dataset: {
          storageId
        }
      }
    })
  }
  const chosen = ids => ({
    action: 'ok', element: {
      querySelectorAll: () => ids.map(value => ({
        value
      }))
    }
  })
  const bagActor = capacity => ({
    id: 'a1', name: 'Clo', updateEmbeddedDocuments: vi.fn(async () => []),
    items: collection([
      {
        id: 'bag', type: 'itemStorage', name: 'Sac', system: {
          type: 'bag', capacity: {
            value: capacity
          }
        }
      },
      {
        id: 'g1', type: 'itemGear', name: 'Corde', system: {
          storedIn: 'bag'
        }
      },
      {
        id: 'g2', type: 'itemGear', name: 'Lampe', system: {
        }
      },
      {
        id: 'g3', type: 'itemGear', name: 'Médikit', system: {
        }
      },
    ])
  })

  it('book: a full bag is refused before the choice', async () => {
    const actor = bagActor(1)
    await putIn(actor, 'bag')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StorageFull')
    expect(foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled()
  })
  it('family lifted: a full bag takes more, and the GM is told once', async () => {
    lift()
    dialogResult = chosen(['g2', 'g3'])
    const actor = bagActor(1)
    await putIn(actor, 'bag')
    await flush()
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{
      _id: 'g2', 'system.storedIn': 'bag'
    }, {
      _id: 'g3', 'system.storedIn': 'bag'
    }])
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(whispered()).toEqual(['SR5.WARN_StorageFull'])
  })
  it('book: more than the room left is refused', async () => {
    dialogResult = chosen(['g2', 'g3'])
    const actor = bagActor(2)
    await putIn(actor, 'bag')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StorageNotEnoughRoom')
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })
  it('family lifted: more than the room left goes in', async () => {
    lift()
    dialogResult = chosen(['g2', 'g3'])
    const actor = bagActor(2)
    await putIn(actor, 'bag')
    await flush()
    expect(actor.updateEmbeddedDocuments).toHaveBeenCalled()
    expect(whispered()).toEqual(['SR5.WARN_StorageNotEnoughRoom'])
  })

  describe('a garage beyond the lifestyle (Run Faster p. 216)', () => {
    const garageActor = () => ({
      id: 'a1', name: 'Clo', updateEmbeddedDocuments: vi.fn(async () => []),
      items: collection([
        {
          id: 'gar', type: 'itemStorage', name: 'Box', system: {
            type: 'garage', vehicleType: 'motorcycle', capacity: {
              value: 0
            }
          }
        },
        {
          id: 'v1', type: 'itemVehicle', name: 'Moto', system: {
          }
        },
      ])
    })
    it('book: refused', async () => {
      const actor = garageActor()
      await putIn(actor, 'gar')
      expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StorageGarageLifestyle')
      expect(foundry.applications.api.DialogV2.wait).not.toHaveBeenCalled()
    })
    it('its box unchecked, the family checked: the vehicle goes in, and the GM is told', async () => {
      lift({
        garage: false
      })
      dialogResult = chosen(['v1'])
      const actor = garageActor()
      await putIn(actor, 'gar')
      await flush()
      expect(actor.updateEmbeddedDocuments).toHaveBeenCalled()
      expect(whispered()).toEqual(['SR5.WARN_StorageGarageLifestyle'])
    })
  })
})

describe('B13 lot 5, Palming untrained (SR5 p. 135)', () => {
  const thief = () => ({
    id: 'a1', name: 'Clo', rollTest: vi.fn(), system: {
      skills: {
        palming: {
          rating: {
            value: 0
          }
        }
      }
    }
  })
  beforeEach(() => {
    vi.spyOn(SR5Pickpocket, 'askPlant').mockResolvedValue({
      itemId: 'i1', quantity: 1
    })
    vi.spyOn(SR5Pickpocket, 'actorIdOf').mockReturnValue('t1')
  })
  it('book: the pickpocket is refused', async () => {
    const actor = thief()
    await SR5Pickpocket.start({
      actor
    }, {
      actor: {
      }
    }, 'plant')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_PickpocketNeedsPalming')
    expect(actor.rollTest).not.toHaveBeenCalled()
  })
  it('family lifted: the thief rolls, and the GM is whispered', async () => {
    lift()
    const actor = thief()
    await SR5Pickpocket.start({
      actor
    }, {
      actor: {
      }
    }, 'plant')
    await flush()
    expect(actor.rollTest).toHaveBeenCalledWith('pickpocket', null, expect.objectContaining({
      mode: 'plant'
    }))
    expect(whispered()).toEqual(['SR5.WARN_PickpocketNeedsPalming'])
  })
  it('book: hiding an object is refused', async () => {
    const actor = {
      ...thief(), isOwner: true
    }
    await SR5Conceal.startHide(actor, {
      id: 'i1', system: {
        concealment: 2
      }
    })
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_PickpocketNeedsPalming')
    expect(actor.rollTest).not.toHaveBeenCalled()
  })
  it('family lifted: the object is hidden by a roll, and the GM is whispered', async () => {
    lift()
    const actor = {
      ...thief(), isOwner: true
    }
    await SR5Conceal.startHide(actor, {
      id: 'i1', system: {
        concealment: 2
      }
    })
    await flush()
    expect(actor.rollTest).toHaveBeenCalledWith('concealItem', null, {
      itemId: 'i1'
    })
    expect(whispered()).toEqual(['SR5.WARN_PickpocketNeedsPalming'])
  })
})

describe('B13 lot 5, lock picked without a kit (SR5 p. 450)', () => {
  const storage = {
    id: 's1', type: 'actorStorage', name: 'Coffre', system: {
      lock: {
        type: 'mechanical', locked: true, rating: 3
      }
    }
  }
  // No Locksmith and nothing to stand in for it: past the kit, the card says there is no die to roll
  const picker = {
    id: 'a1', type: 'actorPc', name: 'Clo', items: [], testUserPermission: () => true, system: {
      skills: {
        locksmith: {
          rating: {
            value: 0
          }, canDefault: false
        }
      }, attributes: {
        agility: {
          augmented: {
            value: 4
          }
        }
      }, limits: {
      }
    }
  }
  beforeEach(() => {
    asGM()
    globalThis.game.users.get = () => ({
      id: 'p1'
    })
    globalThis.fromUuid = async uuid => ({
      actor: uuid === 'st' ? storage : picker
    })
    vi.spyOn(SR5StorageLock, 'squaresBetween').mockReturnValue(1)
  })
  afterEach(() => {
    delete globalThis.fromUuid
  })
  const pick = () => SR5StorageLock.pick({
    storageTokenUuid: 'st', pickerTokenUuid: 'pk'
  }, 'p1')

  it('book: the card says a kit is needed', async () => {
    await pick()
    expect(rendered).toEqual([expect.objectContaining({
      noKit: true
    })])
  })
  it('its box unchecked: the picker works bare-handed, the GM is told', async () => {
    lift({
      lockpick: false
    })
    await pick()
    expect(rendered).toEqual([expect.objectContaining({
      noPool: true
    })])
    expect(rendered[0].noKit).toBeUndefined()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.RULELOCKS_Whisper')
  })
  it('family lifted: the same', async () => {
    lift()
    await pick()
    expect(rendered[0].noKit).toBeUndefined()
  })
})

describe('B13 lot 5, a hold on someone already held (SR5 p. 195)', () => {
  let holder, held
  const fighter = (id, effects = []) => ({
    id, name: id, effects, createEmbeddedDocuments: vi.fn(async () => [])
  })
  beforeEach(() => {
    asGM()
    holder = fighter('h1')
    held = fighter('t1', [{
      flags: {
        sr5: {
          grapple: {
            role: 'held', holdId: 'old'
          }
        }
      }
    }])
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'h1' ? holder : held))
    vi.spyOn(SR5_GrappleHelpers, 'warn').mockImplementation(() => {})
    vi.spyOn(SR5_GrappleHelpers, 'postHoldCard').mockResolvedValue()
    foundry.utils.randomID = () => 'new'
  })
  afterEach(() => {
    delete foundry.utils.randomID
  })
  it('book: refused, the warning goes back to the one who asked', async () => {
    await SR5_GrappleHelpers.startHold('h1', 't1', 2, 'subdue', 'p1')
    expect(SR5_GrappleHelpers.warn).toHaveBeenCalledWith('SR5.WARN_GrappleAlreadyHeld', 'p1')
    expect(holder.createEmbeddedDocuments).not.toHaveBeenCalled()
  })
  it('family lifted: the hold is taken, and the GM is told', async () => {
    lift()
    await SR5_GrappleHelpers.startHold('h1', 't1', 2, 'subdue', 'p1')
    expect(SR5_GrappleHelpers.warn).not.toHaveBeenCalled()
    expect(holder.createEmbeddedDocuments).toHaveBeenCalled()
    expect(held.createEmbeddedDocuments).toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.RULELOCKS_Whisper')
  })
})

describe('B13 lot 5, the drug designer without Chemistry (Chrome Flesh p. 194)', () => {
  const owned = (chemistry = 0) => ({
    id: 'a1', name: 'Clo', isOwner: true, createEmbeddedDocuments: vi.fn(async () => [{
      name: 'Kami', uuid: 'Actor.a1.Item.d1'
    }]), system: {
      skills: {
        chemistry: {
          rating: {
            value: chemistry
          }
        }
      }
    }
  })
  const create = async actor => {
    const app = new SR5DrugDesigner({
      actor
    })
    app.close = vi.fn()
    await SR5DrugDesigner.DEFAULT_OPTIONS.actions.create.call(app)
    return app
  }
  it('book: no button, and the submission is refused', async () => {
    const actor = owned()
    expect(canOfferDrugDesign(actor)).toBe(false)
    await create(actor)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_DrugDesignerNoSkill')
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled()
  })
  it('family lifted: the button shows, the drug goes to the GM pending, and the GM is whispered', async () => {
    lift()
    const actor = owned()
    expect(canDesignDrug(actor)).toBe(false)
    expect(canOfferDrugDesign(actor)).toBe(true)
    await create(actor)
    await flush()
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith('Item', [expect.objectContaining({
      type: 'itemDrug'
    })])
    expect(whispered()).toEqual(['SR5.WARN_DrugDesignerNoSkill'])
  })
  it('family lifted: never for an actor the player does not own', async () => {
    lift()
    const actor = {
      ...owned(), isOwner: false
    }
    expect(canOfferDrugDesign(actor)).toBe(false)
    await create(actor)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_DrugDesignerNoSkill')
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled()
    expect(whispered()).toEqual([])
  })
})
