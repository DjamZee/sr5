import {
  describe, it, expect, vi
} from 'vitest'

// Anomalies de la boutique (djamz.16): system.nuyen.value read 2,425 for 1,000 earned and 1,425 spent. A loss is
// written positive on its transaction (entityActor.js, itemNuyen): the plain sum added the expenses to the gains,
// while the sheet (money.hbs) and the shop (SR5Shop.balance) read gains minus losses.

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')
const {
  SR5Credstick
} = await import('../modules/interface/credstick.js')

const transaction = (id, type, value) => ({
  source: id, type: `itemNuyen_${id}_${type}`, value, isMultiplier: false
})
const actorWith = modifiers => ({
  system: {
    nuyen: {
      base: 0, value: 0, modifiers
    }
  }
})

describe('system.nuyen.value', () => {
  it('is the balance, gains minus losses: 1,000 − 1,425 = −425', () => {
    const actor = actorWith([transaction('a', 'gain', 1000), transaction('b', 'loss', 1425)])
    SR5_CharacterUtility.updateNuyens(actor)
    expect(actor.system.nuyen.value).toBe(-425)
  })

  it('reads as the shop and the credsticks read the ledger', () => {
    const actor = actorWith([transaction('a', 'gain', 5000), transaction('b', 'loss', 1200), transaction('c', 'gain', 300),
      transaction('d', 'loss', 99.5)])
    SR5_CharacterUtility.updateNuyens(actor)
    expect(actor.system.nuyen.value).toBe(4000.5)
    expect(actor.system.nuyen.value).toBe(SR5Credstick.ledgerBalance(actor))
  })

  it('is 0 without a transaction, and the gains alone without an expense', () => {
    const empty = actorWith([])
    SR5_CharacterUtility.updateNuyens(empty)
    expect(empty.system.nuyen.value).toBe(0)
    const earned = actorWith([transaction('a', 'gain', 750)])
    SR5_CharacterUtility.updateNuyens(earned)
    expect(earned.system.nuyen.value).toBe(750)
  })
})
