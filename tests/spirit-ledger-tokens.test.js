import {
  describe, it, expect
} from 'vitest'
import {
  emptyLedger, withSpiritTrait, spiritTraitsFor, ledgerReaders
} from '../modules/system/spirit-ledger.js'

// Wanda, second review of the spirit bonds: a trait ticked on the world actor reached no unlinked token, and a
// change of the ledger left the tokens' actors as they were
describe('Unlinked tokens of a spirit', () => {
  it('a token reads the traits of its world actor', () => {
    const ledger = withSpiritTrait(emptyLedger(), "base1", "isWild", true)
    expect(spiritTraitsFor(ledger, "base1", "Scene.s.Token.t1").isWild).toBe(true)
  })
  it('the traits set on the token itself win', () => {
    let ledger = withSpiritTrait(emptyLedger(), "base1", "isWild", true)
    ledger = withSpiritTrait(ledger, "Scene.s.Token.t1", "isWild", false)
    expect(spiritTraitsFor(ledger, "base1", "Scene.s.Token.t1").isWild).toBe(false)
    expect(spiritTraitsFor(ledger, "base1", "Scene.s.Token.t2").isWild).toBe(true)
  })
  it('a change of the ledger prepares the unlinked tokens again, not only the world actors', () => {
    const base = {
      type: "actorSpirit", system: {
      }
    }
    const tokenActor = {
      type: "actorSpirit", system: {
      }
    }
    const linked = {
      type: "actorSpirit", system: {
      }
    }
    const drone = {
      type: "actorDrone", system: {
      }
    }
    const scenes = [{
      tokens: [{
        actorLink: false, actor: tokenActor
      }, {
        actorLink: true, actor: linked
      }]
    }]
    expect(ledgerReaders([base, drone], scenes)).toEqual([base, tokenActor])
  })
})
