import {
  describe, it, expect
} from 'vitest'
import {
  emptyLedger, characterEntry, withCharacterField, withSpiritTrait, spiritEntry, withBanishTotal, banishCardSeen,
  legacyValues
} from '../modules/system/spirit-ledger.js'
import {
  recountHits, wildBanishVerdict, leashCardVerdict
} from '../modules/entities/items/spirit-bonds.js'

const dice = (...results) => ({
  terms: [{
    results: results.map(r => typeof r === "number" ? {
      result: r, active: true
    } : r)
  }]
})

describe('Spirit ledger, written by the active GM only (Street Grimoire p. 207, Forbidden Arcana p. 169-175)', () => {
  it('keeps a character entry with its defaults, and refuses unknown fields', () => {
    let ledger = withCharacterField(emptyLedger(), "a1", "spiritIndex", "60")
    ledger = withCharacterField(ledger, "a1", "hermeticElementalist", 1)
    expect(characterEntry(ledger, "a1")).toEqual({
      spiritIndex: 60, astralReputationAdjustment: 0, wildIndex: 0, hermeticElementalist: true
    })
    expect(characterEntry(ledger, "nobody").spiritIndex).toBe(0)
    expect(() => withCharacterField(ledger, "a1", "reagents", 5)).toThrow()
  })
  it('keeps spirit traits and banishing totals apart, and remembers a counted card', () => {
    let ledger = withSpiritTrait(emptyLedger(), "s1", "isWild", true)
    expect(spiritEntry(ledger, "s1")).toEqual({
      isElemental: false, isWild: true, hasDomain: false
    })
    ledger = withBanishTotal(ledger, "s1", 5, "m1")
    expect(ledger.banish.s1).toBe(5)
    expect(banishCardSeen(ledger, "m1")).toBe(true)
    expect(withBanishTotal(ledger, "s1", 0).banish.s1).toBeUndefined()
  })
  it('never changes the ledger it was given', () => {
    const ledger = emptyLedger()
    withCharacterField(ledger, "a1", "wildIndex", 3)
    expect(ledger.characters).toEqual({
    })
  })
  it('finds the values the first version left on a sheet', () => {
    expect(legacyValues({
      spiritIndex: 50, wildIndex: 0, hermeticElementalist: false
    })).toEqual({
      spiritIndex: 50
    })
    expect(legacyValues({
      spiritIndex: 0
    })).toBe(null)
  })
})

describe('Forged cards (the GM counts the hits again)', () => {
  it('counts the dice, not the hits the card claims, within the pool plus Chance', () => {
    expect(recountHits(dice(6, 5, 1, 2), 4)).toBe(2)
    expect(recountHits(dice(6, 6, 6, 6, 6, 6), 3)).toBe(3)
    expect(recountHits(dice(6, 6, 6, 6), 2, 1)).toBe(3)
    expect(recountHits(dice(6, 6, 6), 3, 0, 2)).toBe(2)
    expect(recountHits(undefined, 3)).toBe(null)
  })
  it('a forged banishing card with 99 hits written and no dice is refused', () => {
    expect(wildBanishVerdict({
      banisherAuthorOwns: true, resistanceAuthorOwns: true, banisherRoll: undefined, banisherPool: 11, spiritRoll: dice(1), force: 4
    }).ok).toBe(false)
  })
  it('a banishing card written by one who does not own the banisher is refused', () => {
    expect(wildBanishVerdict({
      banisherAuthorOwns: false, resistanceAuthorOwns: true, banisherRoll: dice(6, 6), banisherPool: 11, spiritRoll: dice(1), force: 4
    })).toEqual({
      ok: false, reason: "owner"
    })
  })
  it('the net hits come from the dice of both cards', () => {
    expect(wildBanishVerdict({
      banisherAuthorOwns: true, resistanceAuthorOwns: true, banisherRoll: dice(6, 5, 5, 1), banisherPool: 4, banisherEdge: 0,
      astralLimit: 6, spiritRoll: dice(5, 1, 1), force: 4,
    })).toEqual({
      ok: true, banisherHits: 3, spiritHits: 1, netHits: 2
    })
  })
  it('a leash card about another player\'s spirit is refused', () => {
    expect(leashCardVerdict({
      authorIsGM: false, authorOwnsController: false, spiritOfController: true
    }).ok).toBe(false)
    expect(leashCardVerdict({
      authorIsGM: false, authorOwnsController: true, spiritOfController: false
    }).ok).toBe(false)
    expect(leashCardVerdict({
      authorIsGM: true, authorOwnsController: false, spiritOfController: true
    }).ok).toBe(true)
  })
})
