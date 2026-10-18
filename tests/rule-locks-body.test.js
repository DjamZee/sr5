import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// B13, lot 4 (PLAN-AUTOMATISATION-LEGERE.md, family 6 "body"): each site keeps its test, only its exit goes through
// refuseByRule. Book: refused as before. Lifted: the action goes on, and the gamemaster hears of it

const emits = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => {
      emits.push([type, data])
    }
  },
}))

const {
  screenRejectedImplants, boneSwitchRefused
} = await import('../modules/system/implant-essence.js')
const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5Shop
} = await import('../modules/interface/shop.js')
const {
  applyStabilization
} = await import('../modules/system/bb-healing.js')
const {
  startTreatment, resolveOverwritersNow
} = await import('../modules/system/cfd-treatment.js')
const {
  default: SR5_RollDialog
} = await import('../modules/rolls/roll-dialog.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

let settings, asked
// Waits for the dynamic imports the code under test starts (not a fixed delay, which a loaded machine can outlast)
const flush = async () => {
  await vi.dynamicImportSettled()
  await new Promise(resolve => setTimeout(resolve, 0))
}
const lift = () => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), body: false
  }
}
const bodyKeys = () => emits.filter(([, d]) => d.family === 'body').map(([, d]) => d.key)
const asGM = () => {
  globalThis.game.user = {
    id: 'gm', isGM: true, name: 'MJ'
  }
}

beforeEach(() => {
  resetWhispers()
  emits.length = 0
  asked = 0
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'),
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse'
  }
  globalThis.game.users = {
    activeGM: {
      id: 'gm'
    }
  }
  globalThis.ui = {
    notifications: {
      warn: vi.fn(), info: vi.fn()
    }
  }
  globalThis.foundry.applications.api.DialogV2 = {
    confirm: async () => {
      asked++
      return false
    }
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.foundry.applications.api.DialogV2
  delete globalThis.game.users
  delete globalThis.game.combats
  delete globalThis.fromUuid
})

const sensitive = {
  type: 'itemQuality', name: 'Système sensible', system: {
    isActive: true, systemEffects: {
      0: {
        category: 'specialCase', value: 'doubleEssenceCost'
      }
    }
  }
}
const bioware = name => ({
  type: 'itemAugmentation', name, system: {
    type: 'bioware', storedIn: ''
  }
})
const lacing = (name, extra = {
}) => ({
  id: name, type: 'itemAugmentation', name: `Ossature renforcée (${name})`, system: {
    type: 'cyberware', storedIn: '', isActive: true, ...extra
  }
})
const body = (items = []) => Object.assign(Object.create(Actor.prototype), {
  id: 'a1', name: 'Essai', items
})

describe('implants rejected (SR5 p. 89, p. 458)', () => {
  it('book: the player is refused, as before', async () => {
    const warned = []
    const g = bioware('Glande')
    const result = await screenRejectedImplants(body([sensitive]), [g], {
      isGM: false, warn: key => warned.push(key)
    })
    expect(result.refused).toEqual([g])
    expect(warned).toEqual(['SR5.WARN_ImplantRejected'])
  })

  it('lifted: the implants go in, and the gamemaster receives the list', async () => {
    lift()
    const warned = []
    const result = await screenRejectedImplants(body([sensitive]), [bioware('Glande'), bioware('Muscles')], {
      isGM: false, warn: key => warned.push(key)
    })
    await flush()
    expect(result).toEqual({
      refused: [], confirmed: true
    })
    expect(warned).toEqual([])
    expect(asked).toBe(0)
    expect(bodyKeys()).toEqual(['SR5.WARN_ImplantRejected'])
    expect(emits[0][1].data.name).toBe('Glande, Muscles')
  })

  it('lifted: a second Ossature renforcée goes in too', async () => {
    lift()
    const result = await screenRejectedImplants(body([lacing('Titane')]), [lacing('Plastique')], {
      isGM: false
    })
    await flush()
    expect(result.refused).toEqual([])
    expect(bodyKeys()).toEqual(['SR5.WARN_BoneLacingSecond'])
  })

  it('the gamemaster is still asked, lifted or not', async () => {
    lift()
    const g = bioware('Glande')
    expect((await screenRejectedImplants(body([sensitive]), [g], {
      isGM: true
    })).refused).toEqual([g])
    expect(asked).toBe(1)
  })
})

describe('switching a second Ossature renforcée on (SR5 p. 458)', () => {
  const two = () => {
    const second = lacing('Plastique', {
      isActive: false
    })
    return {
      actor: body([lacing('Titane'), second]), second
    }
  }
  it('book: refused to the player', () => {
    const {
      actor, second
    } = two()
    expect(boneSwitchRefused(actor, second)).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalled()
  })
  it('lifted: the switch goes, the gamemaster hears of it', async () => {
    lift()
    const {
      actor, second
    } = two()
    expect(boneSwitchRefused(actor, second)).toBe(false)
    await flush()
    expect(bodyKeys()).toEqual(['SR5.WARN_BoneLacingSecond'])
  })
  it('the gamemaster goes past it, warned, as before', () => {
    const {
      actor, second
    } = two()
    expect(boneSwitchRefused(actor, second, true)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BoneLacingGMPast')
  })
})

describe('Essence at 0 in the shop (SR5 p. 54)', () => {
  const buyer = {
    id: 'a1', name: 'Essai', items: [], system: {
      essence: {
        value: 0.5, hole: 0
      }
    }
  }
  const lines = [{
    type: 'itemAugmentation', name: 'Bras', system: {
      type: 'cyberware', essenceCost: {
        value: 1, base: 1
      }, essenceMultiplier: 1
    }, grade: null, quantity: 1
  }]
  it('book: the purchase is refused to a player', async () => {
    const warned = []
    expect(await SR5Shop.essenceAllows(buyer, lines, {
      isGM: false, warn: key => warned.push(key)
    })).toBe(false)
    expect(warned).toEqual(['SR5.WARN_ShopEssenceTooLow'])
  })
  it('lifted: the purchase goes, the gamemaster hears of it', async () => {
    lift()
    expect(await SR5Shop.essenceAllows(buyer, lines, {
      isGM: false, warn: () => {
        throw new Error('told off')
      }
    })).toBe(true)
    await flush()
    expect(bodyKeys()).toEqual(['SR5.WARN_ShopEssenceTooLow'])
  })
})

describe('Stun heals first (SR5 p. 207)', () => {
  const patient = () => ({
    id: 'a1', name: 'Essai', system: {
      conditionMonitors: {
        stun: {
          actual: {
            value: 2, base: 2
          }, value: 9
        },
        physical: {
          actual: {
            value: 4, base: 4
          }, value: 10
        },
      }
    },
    toObject() {
      return JSON.parse(JSON.stringify({
        system: this.system
      }))
    },
    update: vi.fn(async () => {}),
  })
  it('book: the healing is refused', () => {
    expect(SR5_ActorHelper.stunHealsFirstRefused(patient(), 'healing', 'physical')).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_StunHealsFirst')
  })
  it('lifted: the healing goes, the gamemaster hears of it', async () => {
    lift()
    expect(SR5_ActorHelper.stunHealsFirstRefused(patient(), 'healing', 'physical')).toBe(false)
    await flush()
    expect(bodyKeys()).toEqual(['SR5.WARN_StunHealsFirst'])
  })
  it('lifted: the healing card heals the Physical boxes', async () => {
    lift()
    const actor = patient()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    // The actor double carries its own toObject, a structured clone would drop it
    vi.spyOn(foundry.utils, 'deepClone').mockImplementation(a => a)
    vi.spyOn(SR5_ActorHelper, 'clearDamageKnockout').mockImplementation(async () => {})
    await SR5_ActorHelper.heal('a1', {
      test: {
        type: 'healing', typeSub: 'physical'
      }, roll: {
        netHits: 3
      }
    })
    expect(actor.update).toHaveBeenCalled()
  })
})

describe('a spell that does not stabilize (Better Than Bad p. 15-16)', () => {
  const card = {
    test: {
      type: 'spell'
    }, owner: {
      itemUuid: 'Item.s'
    }, magic: {
      force: 1
    }
  }
  const patient = {
    uuid: 'Actor.p', name: 'Patient', system: {
      conditionMonitors: {
        overflow: {
          actual: {
            value: 3
          }
        }
      }
    }
  }
  beforeEach(() => {
    asGM()
    globalThis.fromUuid = async () => ({
      name: 'Boule de feu'
    })
  })
  it('book: refused before the gamemaster is asked', async () => {
    expect(await applyStabilization(card, patient, body())).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.BB_SpellDoesNotStabilize')
    expect(asked).toBe(0)
  })
  it('lifted: the gamemaster is asked to stabilize all the same', async () => {
    lift()
    await applyStabilization(card, patient, body())
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.RULELOCKS_Whisper')
    expect(asked).toBe(1)
  })
})

describe('CFD treatments (Dark Terrors p. 87)', () => {
  const head = {
    uuid: 'Actor.h', name: 'Monade'
  }
  beforeEach(() => {
    asGM()
    globalThis.game.time = {
      worldTime: 0
    }
  })
  it('book: NanoScrub by aerosol is refused', async () => {
    await startTreatment(head, {
      product: 'nanoscrub', doses: 0, vector: 'aerosol'
    })
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.CFD_NanoScrubIVOnly')
  })
  it('lifted: NanoScrub by aerosol goes in', async () => {
    lift()
    await startTreatment(head, {
      product: 'nanoscrub', doses: 0, vector: 'aerosol'
    })
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.RULELOCKS_Whisper')
  })
  const fighting = () => {
    globalThis.game.combats = [{
      started: true, combatants: [{
        actor: {
          uuid: 'Actor.h'
        }
      }]
    }]
  }
  it('book: the Overwriters are not resolved at once in a combat', async () => {
    fighting()
    await resolveOverwritersNow(head)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.CFD_ResolveInCombat')
  })
  it('lifted: the gamemaster resolves them at once in a combat too', async () => {
    lift()
    fighting()
    await resolveOverwritersNow(head)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.RULELOCKS_Whisper')
  })
})

describe('no medkit (SR5 p. 208)', () => {
  const pick = async () => {
    const saved = globalThis.game.actors
    globalThis.game.actors = {
      get: () => ({
        id: 'a1', name: 'Essai', items: [], system: {
        }
      })
    }
    const fields = {
    }
    const html = {
      querySelector: sel => (fields[sel] ??= {
        value: 0, style: {
        }
      }),
      querySelectorAll: () => [],
    }
    const dialogData = {
      owner: {
        actorId: 'a1'
      }, dicePool: {
        base: 6, modifiers: []
      }, limit: {
        modifiers: {
        }
      }, various: {
      }, test: {
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    await roll._selectModifiers({
      currentTarget: {
        dataset: {
          target: 'dicePoolModHealingSupplies', modifier: 'healingSupplies'
        }
      }, target: {
        value: 'medkit'
      },
    }, html, dialogData)
    globalThis.game.actors = saved
    return Object.entries(fields).find(([sel]) => sel.includes('dicePoolModHealingSupplies'))?.[1].value
  }
  it('book: the player is told, the value is 0', async () => {
    expect(await pick()).toBe(0)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NoMedkit')
  })
  it('lifted: no telling off, the gamemaster hears of it, the value is 0 (no kit to read)', async () => {
    lift()
    expect(await pick()).toBe(0)
    await flush()
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(bodyKeys()).toEqual(['SR5.WARN_NoMedkit'])
  })
})
