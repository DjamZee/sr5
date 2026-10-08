import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'

// The #633 port (P5, 08/10): the card names who stands in the bubbles bought at casting (SR5 p. 329), and the
// defense and the two resistances leave them untouched. The sharing of the points is tested in spell-shaping.test.js

globalThis.CONFIG ??= {
}
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: async () => {}
  },
}))

const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  default: defense
} = await import('../modules/rolls/roll-prepare-case/rollData-Defense.js')
const {
  default: resistance
} = await import('../modules/rolls/roll-prepare-case/rollData-Resistance.js')
const {
  default: spellResistance
} = await import('../modules/rolls/roll-prepare-case/rollData-SpellResistance.js')

const token = (id, name = id) => ({
  id, name, actor: {
    id: `actor-${id}`, isToken: true, token: {
      id
    }, name
  }
})

const card = (sparedCount, sparedActors = []) => ({
  test: {
    type: 'spell'
  },
  magic: {
    spell: {
      area: 6, sparedCount, sparedActors
    }
  },
  chatCard: {
    buttons: {
      spellShapingSpare: {
        label: `SR5.SpellShapingSpare (0/${sparedCount})`
      }
    }
  },
})

let updated
beforeEach(() => {
  updated = []
  vi.spyOn(SR5_RollMessage, 'updateRollCardHelper').mockImplementation(async (id, data) => {
    updated.push([id, structuredClone(data)])
  })
  globalThis.game.user = {
    id: 'p1', isGM: false, targets: new Set()
  }
  globalThis.canvas = {
    tokens: {
      controlled: []
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
})

describe('the button that names who stands in a bubble', () => {
  it('spares the targeted tokens, and drops the button once every bubble is used', async () => {
    game.user.targets = new Set([token('t1', 'Ganger'), token('t2', 'Ally')])
    const data = card(2)
    await SR5_RollMessage.spareWithSpellShaping('m1', data)
    expect(updated).toHaveLength(1)
    const [, sent] = updated[0]
    expect(sent.magic.spell.sparedActors).toEqual([{
      id: 't1', name: 'Ganger'
    }, {
      id: 't2', name: 'Ally'
    }])
    expect(sent.chatCard.buttons.spellShapingSpare).toBeUndefined()
  })

  it('keeps the button with what is left, when one bubble remains', async () => {
    canvas.tokens.controlled = [token('t1')]
    await SR5_RollMessage.spareWithSpellShaping('m1', card(2))
    const [, sent] = updated[0]
    expect(sent.magic.spell.sparedActors.map(s => s.id)).toEqual(['t1'])
    expect(sent.chatCard.buttons.spellShapingSpare.label).toContain('(1/2)')
  })

  it('never spares more characters than bubbles bought', async () => {
    game.user.targets = new Set([token('t1'), token('t2')])
    await SR5_RollMessage.spareWithSpellShaping('m1', card(1))
    expect(updated[0][1].magic.spell.sparedActors.map(s => s.id)).toEqual(['t1'])
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpellShapingNoBubbleLeft')
  })

  it('refuses to guess when the targets and the selection differ', async () => {
    game.user.targets = new Set([token('victim')])
    canvas.tokens.controlled = [token('ally')]
    await SR5_RollMessage.spareWithSpellShaping('m1', card(1))
    expect(updated).toEqual([])
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpellShapingTargetAndSelectionDiffer')
  })

  it('asks for a token when none is targeted or selected', async () => {
    await SR5_RollMessage.spareWithSpellShaping('m1', card(1))
    expect(updated).toEqual([])
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_SpellShapingNoTokenSelected')
  })

  it('a character already spared is not counted twice', async () => {
    game.user.targets = new Set([token('t1')])
    await SR5_RollMessage.spareWithSpellShaping('m1', card(2, [{
      id: 't1', name: 't1'
    }]))
    expect(updated).toEqual([])
  })
})

describe('a spared character rolls nothing', () => {
  const spared = {
    type: 'actorPc', name: 'Ally', isToken: true, token: {
      id: 't1'
    }, system: {
    }
  }
  const sparedCard = () => card(1, [{
    id: 't1', name: 'Ally'
  }])

  it('no defense test', async () => {
    expect(await defense({
    }, spared, sparedCard())).toBeUndefined()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_SparedBySpellShaping')
  })
  it('no damage to resist from a direct area spell', async () => {
    expect(await resistance({
    }, 'resistanceCard', spared, sparedCard())).toBeUndefined()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_SparedBySpellShaping')
  })
  it('no spell to resist', async () => {
    expect(await spellResistance({
    }, spared, sparedCard())).toBeUndefined()
    expect(ui.notifications.info).toHaveBeenCalledWith('SR5.INFO_SparedBySpellShaping')
  })
})
