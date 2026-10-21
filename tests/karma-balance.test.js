import {
  describe, it, expect, vi, beforeAll
} from 'vitest'

// Petits correctifs du 22/10: system.karma.value summed the gains AND the expenses, as system.nuyen.value did before
// djamz.16 (nuyen-balance.test.js). An expense is written positive on its transaction (entityActor.js, itemKarma): the
// plain sum added it to the gains, while the sheet (karma.hbs) reads gains minus expenses.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

beforeAll(() => {
  globalThis.game = globalThis.game || {
  }
  globalThis.game.i18n = globalThis.game.i18n || {
    localize: k => k
  }
})

const transaction = (id, type, value) => ({
  source: id, type: `itemKarma_${id}_${type}`, value, isMultiplier: false
})
const pcWith = modifiers => ({
  system: {
    karma: {
      base: 0, value: 0, modifiers
    },
    streetCred: {
      base: 0, value: 0, modifiers: []
    },
    specialProperties: {
      streetCredDivisor: {
        value: 0, modifiers: []
      }
    },
  }
})
// What the sheet shows as "current Karma" (karma.hbs: gainModifiersSum minus lossModifiersSum)
const sheetKarma = modifiers => modifiers.reduce((sum, m) => sum + (m.type.endsWith('_gain') ? m.value : m.type.endsWith('_loss') ? -m.value : 0), 0)

describe('system.karma.value', () => {
  it('is the balance, gains minus expenses: 30 − 45 = −15 (the former sum read 75)', () => {
    const actor = pcWith([transaction('a', 'gain', 30), transaction('b', 'loss', 45)])
    SR5_CharacterUtility.updateKarmas(actor)
    expect(actor.system.karma.value).not.toBe(75)
    expect(actor.system.karma.value).toBe(-15)
  })

  it('reads as the sheet reads the transactions', () => {
    const modifiers = [transaction('a', 'gain', 50), transaction('b', 'loss', 12), transaction('c', 'gain', 7), transaction('d', 'loss', 20)]
    const actor = pcWith(modifiers)
    SR5_CharacterUtility.updateKarmas(actor)
    expect(actor.system.karma.value).toBe(25)
    expect(actor.system.karma.value).toBe(sheetKarma(modifiers))
  })

  it('is 0 without a transaction, and the gains alone without an expense', () => {
    const empty = pcWith([])
    SR5_CharacterUtility.updateKarmas(empty)
    expect(empty.system.karma.value).toBe(0)
    const earned = pcWith([transaction('a', 'gain', 18)])
    SR5_CharacterUtility.updateKarmas(earned)
    expect(earned.system.karma.value).toBe(18)
  })

  it('leaves Street Cred to the gains alone (SR5 p. 372): 45 earned, 40 spent, still 4', () => {
    const actor = pcWith([transaction('a', 'gain', 45), transaction('b', 'loss', 40)])
    SR5_CharacterUtility.updateKarmas(actor)
    expect(actor.system.streetCred.modifiers.reduce((s, m) => s + m.value, 0)).toBe(4)
  })
})
