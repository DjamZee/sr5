import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

globalThis.CONFIG ??= {
}
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  blightDrops, blightStrikes, sweepBlight
} = await import('../modules/system/blight-strikes.js')
const {
  SR5_Toxins
} = await import('../modules/entities/items/toxins.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

// Better Than Bad p. 141, "perd sa connexion à la manasphère" (decision of DjamZ after Victoire's review of séance H)
const blight = {
  type: 'itemEffect', system: {
    type: 'toxinEffectManasphereCut'
  }
}
const dualNature = {
  type: 'itemPower', system: {
    systemEffects: {
      0: {
        category: 'spiritPower', value: 'dualNatured'
      }
    }
  }
}
const mage = (items, {
  perceiving = false, projecting = false, type = 'actorPc'
} = {
}) => ({
  name: 'Mage', type, items,
  system: {
    visions: {
      astral: {
        isActive: perceiving
      }
    }, initiatives: {
      astralInit: {
        isActive: projecting
      }, physicalInit: {
        isActive: !projecting
      }
    }
  },
  updates: [],
  // As Foundry does, the update rewrites the object it is given: what it was is kept in `updates`
  update: vi.fn(async function (data) {
    this.updates.push({
      ...data
    })
    for (const k of Object.keys(data)) delete data[k]
  }),
  updateEmbeddedDocuments: vi.fn(async () => {}),
})
const item = (id, type, isActive, extra = {
}) => ({
  id, name: id, type, system: {
    isActive, ...extra
  }
})

describe('Blight cuts the astral too', () => {
  it('blocks Assensing, Astral Combat and an astral weapon', () => {
    const a = mage([blight])
    expect(SR5_Toxins.blightBlocksRoll(a, 'skillDicePool', 'assensing')).toBe(true)
    expect(SR5_Toxins.blightBlocksRoll(a, 'skillDicePool', 'astralCombat')).toBe(true)
    expect(SR5_Toxins.blightBlocksRoll(a, 'weaponAstral', null)).toBe(true)
  })
  // Decision of DjamZ (third round): the book is followed, dual-natured beings are "affectées de manière similaire"
  it('cuts the astral of a dual-natured being too, and leaves it to a spirit, which the book names only for the DMSO', () => {
    expect(SR5_Toxins.blightBlocksRoll(mage([blight, dualNature]), 'skillDicePool', 'assensing')).toBe(true)
    expect(SR5_Toxins.blightBlocksAstral(mage([blight], {
      type: 'actorSpirit'
    }))).toBe(false)
  })
  it('blocks nothing astral without Blight', () => {
    expect(SR5_Toxins.blightBlocksRoll(mage([]), 'skillDicePool', 'assensing')).toBe(false)
  })
})

describe('when Blight strikes', () => {
  beforeEach(() => {
    globalThis.game ??= {
    }
    game.users = {
      activeGM: {
        isSelf: true
      }
    }
    game.i18n = {
      localize: k => k, format: k => k
    }
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
    vi.spyOn(SR5_ActorHelper, 'deleteSustainedEffect').mockResolvedValue()
    vi.spyOn(SR5_CharacterUtility, 'handleAstralVision').mockResolvedValue()
  })
  afterEach(() => vi.restoreAllMocks())

  it('switches off the sustained spells (and their effects), the active foci, astral perception and projection', async () => {
    const a = mage([blight, item('focus', 'itemFocus', true), item('sort', 'itemSpell', true, {
      targetOfEffect: ['Actor.x.Item.e']
    }), item('rangé', 'itemFocus', false), item('pouvoir', 'itemAdeptPower', true)], {
      perceiving: true, projecting: true
    })
    await blightStrikes(a)
    expect(SR5_ActorHelper.deleteSustainedEffect).toHaveBeenCalledWith('Actor.x.Item.e')
    expect(a.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{
      _id: 'focus', 'system.isActive': false
    }, {
      _id: 'sort', 'system.isActive': false, 'system.targetOfEffect': []
    }])
    expect(a.updates).toEqual([{
      'system.visions.astral.isActive': false,
      'system.initiatives.astralInit.isActive': false,
      'system.initiatives.physicalInit.isActive': true,
    }])
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_BlightDrops')
  })

  // Victoire's second review: the astral initiative's status and the sustained spell's template went on
  it("takes off the astral initiative's status and the templates of the sustained spells", async () => {
    const template = {
      flags: {
        sr5: {
          itemUuid: 'Actor.m.Item.lumiere'
        }
      }, delete: vi.fn(async () => {})
    }
    const other = {
      flags: {
        sr5: {
          itemUuid: 'Actor.m.Item.autre'
        }
      }, delete: vi.fn(async () => {})
    }
    game.scenes = [{
      templates: [template, other]
    }]
    const spell = {
      ...item('lumiere', 'itemSpell', true), uuid: 'Actor.m.Item.lumiere'
    }
    const a = mage([blight, spell], {
      projecting: true
    })
    a.effects = [{
      id: 'st', origin: 'initiativeMode'
    }, {
      id: 'autre', origin: 'prone'
    }]
    a.deleteEmbeddedDocuments = vi.fn(async () => {})
    await blightStrikes(a)
    expect(template.delete).toHaveBeenCalled()
    expect(other.delete).not.toHaveBeenCalled()
    expect(a.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['st'])
    delete game.scenes
  })

  it('is written by the active gamemaster alone', async () => {
    game.users.activeGM.isSelf = false
    const a = mage([blight, item('focus', 'itemFocus', true)], {
      perceiving: true
    })
    await blightStrikes(a)
    expect(a.updateEmbeddedDocuments).not.toHaveBeenCalled()
    expect(a.update).not.toHaveBeenCalled()
  })

  it('takes a dual-natured being out of astral perception too', () => {
    expect(blightDrops(mage([blight, dualNature], {
      perceiving: true
    })).astral).toEqual({
      'system.visions.astral.isActive': false
    })
  })
})

// Clémence's review: Blight laid while no gamemaster was connected, or in a world older than the strike
describe('the sweep of Blight at the load', () => {
  beforeEach(() => {
    globalThis.game ??= {
    }
    game.users = {
      activeGM: {
        isSelf: true
      }
    }
    game.i18n = {
      localize: k => k, format: k => k
    }
    game.scenes = []
    globalThis.ui = {
      notifications: {
        info: vi.fn(), warn: vi.fn()
      }
    }
    vi.spyOn(SR5_ActorHelper, 'deleteSustainedEffect').mockResolvedValue()
    vi.spyOn(SR5_CharacterUtility, 'handleAstralVision').mockResolvedValue()
  })
  afterEach(() => vi.restoreAllMocks())

  it('puts in order an actor under Blight whose focus still runs, and leaves the others', async () => {
    const struck = mage([blight, item('focus', 'itemFocus', true)])
    const inOrder = mage([blight, item('rangé', 'itemFocus', false)])
    const free = mage([item('focus', 'itemFocus', true)], {
      perceiving: true
    })
    game.actors = [struck, inOrder, free]
    await sweepBlight()
    expect(struck.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{
      _id: 'focus', 'system.isActive': false
    }])
    expect(inOrder.updateEmbeddedDocuments).not.toHaveBeenCalled()
    expect(free.updateEmbeddedDocuments).not.toHaveBeenCalled()
    expect(free.updates).toEqual([])
  })

  it('cuts astral perception left on under Blight', async () => {
    const a = mage([blight], {
      perceiving: true
    })
    await sweepBlight([a])
    expect(a.updates).toEqual([{
      'system.visions.astral.isActive': false
    }])
  })

  it('does nothing on a client that is not the active gamemaster', async () => {
    game.users.activeGM.isSelf = false
    const a = mage([blight, item('focus', 'itemFocus', true)])
    await sweepBlight([a])
    expect(a.updateEmbeddedDocuments).not.toHaveBeenCalled()
  })
})
