import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// B13, lot 6 (PLAN-AUTOMATISATION-LEGERE.md, family 4 "magic"): each site keeps its test, only its exit goes through
// refuseByRule (or capByRule). Book: refused as before. Lifted: the action goes on, and the gamemaster hears of it

globalThis.CONFIG ??= {
}
const emits = []
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async (type, data) => {
      emits.push([type, data])
    }
  },
}))

const {
  SR5_PrepareRollTest
} = await import('../modules/rolls/roll-prepare.js')
const {
  SR5_PrepareRollHelper
} = await import('../modules/rolls/roll-prepare-helpers.js')
const {
  SR5_Toxins
} = await import('../modules/entities/items/toxins.js')
const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5Combat
} = await import('../modules/system/srcombat.js')
const {
  SR5_RitualCircle
} = await import('../modules/rolls/roll-helpers/ritualCircle.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  getTargetedData
} = await import('../modules/rolls/roll-prepare-case/rollData-Skill.js')
const {
  SR5
} = await import('../modules/config.js')
const {
  default: SR5_RollDialog
} = await import('../modules/rolls/roll-dialog.js')
const {
  presetLocks, resetWhispers
} = await import('../modules/system/rule-locks.js')

let settings
const flush = () => new Promise(resolve => setTimeout(resolve, 30))
const lift = () => {
  settings.sr5RuleLocks = {
    ...presetLocks('book'), magic: false
  }
}
const magicKeys = () => emits.filter(([, d]) => d.family === 'magic').map(([, d]) => d.key)

const blight = {
  type: 'itemEffect', system: {
    type: 'toxinEffectManasphereCut'
  }
}
const mage = (items = [blight], system = {
}) => ({
  id: 'a1', name: 'Mage', type: 'actorPc', items, system
})

beforeEach(() => {
  resetWhispers()
  emits.length = 0
  settings = {
    sr5RuleLocksMigration: 2, sr5RuleLocks: presetLocks('book'),
  }
  vi.spyOn(globalThis.game.settings, 'get').mockImplementation((ns, key) => settings[key])
  globalThis.game.user = {
    id: 'p1', isGM: false, name: 'Joueuse', targets: new Set()
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
})
afterEach(() => {
  vi.restoreAllMocks()
  delete globalThis.game.users
  delete globalThis.game.messages
})

describe('a roll under Blight (Better Than Bad p. 141)', () => {
  // Past the guard the roll goes on: stop it at its first step
  const cast = actor => {
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      systemRules: {
      }
    })
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(actor)
    game.user.targets = new Set([{
      actor: {
      }
    }])
    vi.spyOn(SR5_PrepareRollHelper, 'getTargetData').mockRejectedValue(new Error('past the guard'))
    return SR5_PrepareRollTest.rollTest(actor, 'spell', null)
  }
  it('book: the spell is refused', async () => {
    await cast(mage())
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
  })
  it('lifted: the spell goes, the gamemaster hears of it', async () => {
    lift()
    await expect(cast(mage())).rejects.toThrow('past the guard')
    await flush()
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(magicKeys()).toEqual(['SR5.WARN_BlightNoSpell'])
  })
})

describe('a preparation at Potency 0 (SR5 p. 309)', () => {
  const trigger = () => {
    const actor = mage([])
    vi.spyOn(SR5_PrepareRollTest, 'getBaseRollData').mockReturnValue({
      systemRules: {
      }, test: {
      }
    })
    vi.spyOn(SR5_PrepareRollHelper, 'getRollingActor').mockReturnValue(actor)
    const item = {
      system: {
        potency: 0, get test() {
          throw new Error('past the guard')
        }
      }
    }
    return SR5_PrepareRollTest.rollTest(item, 'preparation', null)
  }
  it('book: it does not trigger', async () => {
    await trigger()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_PreparationSpent')
  })
  it('lifted: it triggers, the gamemaster hears of it', async () => {
    lift()
    await expect(trigger()).rejects.toThrow('past the guard')
    await flush()
    expect(magicKeys()).toEqual(['SR5.WARN_PreparationSpent'])
  })
})

describe('switching a focus, an adept power or a sustained spell on under Blight', () => {
  const focus = {
    type: 'itemFocus'
  }
  it('book: refused', () => {
    expect(SR5_Toxins.blightSwitchRefused(mage(), focus)).toBe(true)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
  })
  it('lifted: the switch goes, the gamemaster hears of it', async () => {
    lift()
    expect(SR5_Toxins.blightSwitchRefused(mage(), {
      type: 'itemAdeptPower'
    })).toBe(false)
    await flush()
    expect(magicKeys()).toEqual(['SR5.WARN_BlightNoSpell'])
  })
  it('no Blight, or another item: never refused, nobody told', async () => {
    expect(SR5_Toxins.blightSwitchRefused(mage([]), focus)).toBe(false)
    expect(SR5_Toxins.blightSwitchRefused(mage(), {
      type: 'itemWeapon'
    })).toBe(false)
    await flush()
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(emits).toEqual([])
  })
})

describe('the astral under Blight', () => {
  const astralMage = () => mage([blight], {
    visions: Object.fromEntries(Object.keys(SR5.visionActive).map(key => [key, {
      isActive: false
    }])), initiatives: {
      astralInit: {
        isActive: false
      }, physicalInit: {
        isActive: true
      }
    }
  })
  it('book: no astral initiative', () => {
    vi.spyOn(SR5Combat, 'hasActionsLeft').mockReturnValue(true)
    expect(SR5_CharacterUtility.canSwitchToInitiative(astralMage(), 'astralInit')).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
  })
  it('lifted: the astral initiative goes, the gamemaster hears of it', async () => {
    lift()
    vi.spyOn(SR5Combat, 'hasActionsLeft').mockReturnValue(true)
    expect(SR5_CharacterUtility.canSwitchToInitiative(astralMage(), 'astralInit')).toBe(true)
    await flush()
    expect(magicKeys()).toEqual(['SR5.WARN_BlightNoSpell'])
  })
  it('book: no astral perception', async () => {
    const actions = vi.spyOn(SR5Combat, 'hasActionsLeft').mockReturnValue(false)
    await SR5_CharacterUtility.switchVision(astralMage(), 'astral')
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
    expect(actions).not.toHaveBeenCalled()
  })
  it('lifted: the astral perception goes on to its action, the gamemaster hears of it', async () => {
    lift()
    const actions = vi.spyOn(SR5Combat, 'hasActionsLeft').mockReturnValue(false)
    await SR5_CharacterUtility.switchVision(astralMage(), 'astral')
    await flush()
    expect(actions).toHaveBeenCalled()
    expect(magicKeys()).toEqual(['SR5.WARN_BlightNoSpell'])
  })
})

describe('the ritual circle (SR5 p. 298-299)', () => {
  const circle = (extra = {
  }) => ({
    id: 'c1', update: vi.fn(),
    flags: {
      sr5: {
        ritualCircle: {
          itemUuid: 'Actor.lead.Item.r', leaderId: 'lead', leaderName: 'L', ritualName: 'R', tradition: 'hermetic', force: 4, sealed: false, ...extra
        }
      }
    },
  })
  const participant = (items, magic) => ({
    id: 'p', name: 'P', isToken: false, items, system: {
      specialAttributes: {
        magic: {
          augmented: {
            value: magic
          }
        }
      }, skills: {
        ritualSpellcasting: {
          rating: {
            value: 0
          }, test: {
            dicePool: 0
          }
        }
      }, magic: {
        tradition: 'hermetic'
      }
    }
  })
  let created
  const join = async actor => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    globalThis.ChatMessage = {
      getSpeaker: () => ({
        actor: 'p'
      }), create: async data => created.push(data)
    }
    game.messages = {
      contents: []
    }
    await SR5_RitualCircle.join(circle())
  }
  beforeEach(() => {
    created = []
  })
  afterEach(() => {
    delete globalThis.ChatMessage
  })
  it('book: a participant under Blight is refused', async () => {
    await join(participant([blight], 3))
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_BlightNoSpell')
    expect(created).toEqual([])
  })
  it('lifted: a participant under Blight joins, the gamemaster hears of it', async () => {
    lift()
    await join(participant([blight], 3))
    await flush()
    expect(created).toHaveLength(1)
    expect(magicKeys()).toEqual(['SR5.WARN_BlightNoSpell'])
  })
  it('book: a participant with no Magic is refused', async () => {
    await join(participant([], 0))
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_RitualNotAwakened')
    expect(created).toEqual([])
  })
  it('lifted: a participant with no Magic joins with 0 dice, the gamemaster hears of it', async () => {
    lift()
    await join(participant([], 0))
    await flush()
    expect(created[0].flags.sr5.ritualAssist.pool).toBe(0)
    expect(magicKeys()).toEqual(['SR5.WARN_RitualNotAwakened'])
  })
  it('lifted: even a drone with no skill joins, without breaking', async () => {
    lift()
    await join({
      id: 'd', name: 'Drone', isToken: false, items: [], system: {
      }
    })
    expect(created[0].flags.sr5.ritualAssist.pool).toBe(0)
  })

  const seal = async () => {
    const rollTest = vi.spyOn(SR5_PrepareRollTest, 'rollTest').mockResolvedValue(undefined)
    const leader = {
      id: 'lead', isToken: false, isOwner: true, system: {
        skills: {
          ritualSpellcasting: {
            rating: {
              value: 4
            }
          }
        }
      }
    }
    globalThis.fromUuid = async () => ({
      actor: leader
    })
    game.messages = {
      contents: []
    }
    await SR5_RitualCircle.seal(circle({
      contractual: true
    }))
    delete globalThis.fromUuid
    return rollTest
  }
  it('book: a contractual ritual with no participant is not sealed', async () => {
    expect(await seal()).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_RitualContractual')
  })
  it('lifted: it is sealed, the gamemaster hears of it', async () => {
    lift()
    expect(await seal()).toHaveBeenCalled()
    await flush()
    expect(magicKeys()).toEqual(['SR5.WARN_RitualContractual'])
  })
})

describe('a spirit already bound (SR5 p. 300)', () => {
  const spirit = {
    id: 's1', name: 'Esprit', type: 'actorSpirit', system: {
      isBounded: true, force: {
        value: 4
      }
    }
  }
  const binder = mage([], {
    magic: {
      reagents: 0
    }
  })
  const bind = () => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(spirit)
    return getTargetedData({
      target: {
        actorId: 's1'
      }, limit: {
      }, magic: {
      },
    }, 'binding', binder)
  }
  it('book: the binding test is refused', async () => {
    await bind()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpiritAlreadyBounded')
  })
  it('lifted: the binding test goes on, at the spirit\'s Force, the gamemaster hears of it', async () => {
    lift()
    const rollData = await bind()
    await flush()
    expect(rollData.limit.base).toBe(4)
    expect(ui.notifications.warn).not.toHaveBeenCalledWith('SR5.WARN_SpiritAlreadyBounded')
    expect(magicKeys()).toEqual(['SR5.WARN_SpiritAlreadyBounded'])
  })

  // The binding card's resistance button, clicked with the spirit selected
  const resist = async () => {
    const rolled = vi.fn()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue({
      ...spirit, rollTest: rolled
    })
    game.messages = new Map([['m1', {
      flags: {
        sr5data: {
          owner: {
            speakerId: 'a1', actorId: 'a1'
          }, previousMessage: {
          }, target: {
            hasTarget: false
          }, test: {
            type: 'skill'
          },
        }
      }
    }]])
    globalThis.ChatMessage = {
      getSpeaker: () => ({
        token: 's1'
      })
    }
    await SR5_RollMessage.chatButtonAction({
      preventDefault: () => {}, currentTarget: {
        dataset: {
          action: 'opposedTest', type: 'bindingResistance'
        }, closest: () => ({
          dataset: {
            messageId: 'm1'
          }
        }),
      }
    })
    delete globalThis.ChatMessage
    return rolled
  }
  it('book: the spirit\'s resistance is refused', async () => {
    expect(await resist()).not.toHaveBeenCalled()
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpiritAlreadyBounded')
  })
  it('lifted: the spirit resists, the gamemaster hears of it', async () => {
    lift()
    expect(await resist()).toHaveBeenCalledWith('bindingResistance', null, expect.anything())
    await flush()
    expect(magicKeys()).toEqual(['SR5.WARN_SpiritAlreadyBounded'])
  })
})

describe('spell shaping beyond the Magic (SR5 p. 329)', () => {
  const shape = async entered => {
    const actor = {
      system: {
        magic: {
          metamagics: {
            spellShapingValue: {
              value: 3
            }
          }
        }
      }
    }
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockReturnValue(actor)
    const fields = {
    }
    const html = {
      querySelector: sel => (fields[sel] ??= {
        value: 0
      }),
    }
    const dialogData = {
      owner: {
        actorId: 'a1'
      }, dicePool: {
        base: 10, modifiers: []
      }, magic: {
        spell: {
          area: 0
        }
      }, test: {
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    vi.spyOn(roll, 'updateDicePoolValue').mockImplementation(() => {})
    roll._manualInputModifier({
      currentTarget: {
        getAttribute: () => 'dicePoolModSpellShaping', dataset: {
          modifier: 'spellShaping'
        }
      }, target: {
        value: String(entered)
      },
    }, html, dialogData)
    return {
      dialogData, field: fields['[name=dicePoolModSpellShaping]']
    }
  }
  it('book: the value is brought back to the Magic', async () => {
    const {
      dialogData, field
    } = await shape(-5)
    expect(field.value).toBe(-3)
    expect(dialogData.magic.spell.area).toBe(3)
    expect(dialogData.dicePool.modifiers.at(-1).value).toBe(-3)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpellShapingMaxMagic')
  })
  it('lifted: the value entered is kept, the dice pool and the area follow it', async () => {
    lift()
    const {
      dialogData, field
    } = await shape(-5)
    await flush()
    expect(field.value).toBe(-5)
    expect(dialogData.magic.spell.area).toBe(5)
    expect(dialogData.dicePool.modifiers.at(-1).value).toBe(-5)
    expect(ui.notifications.warn).not.toHaveBeenCalled()
    expect(magicKeys()).toEqual(['SR5.WARN_SpellShapingMaxMagic'])
  })
  it('within the Magic: untouched, nobody told', async () => {
    lift()
    const {
      field
    } = await shape(-2)
    await flush()
    expect(field.value).toBe(-2)
    expect(emits).toEqual([])
  })
  it('a positive value stays refused, lifted or not: it is no shaping', async () => {
    lift()
    const {
      field
    } = await shape(2)
    expect(field.value).toBe(0)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpellShapingMin')
  })
})
