import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

const {
  SR5_RollTestHelper
} = await import('../modules/rolls/roll-test-helper.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')
const {
  SPIRIT_TRAITS, SPIRIT_VALUES, withSpiritTrait, spiritEntry, spiritTraitsFor, freeSpiritEdge, FREE_SPIRIT_EDGE_DEFAULT
} = await import('../modules/system/spirit-ledger.js')

// H10 (décision de DjamZ, 06/10) : la case « Esprit libre », du MJ seul, donne à l'esprit sa propre Chance.
// SR5 p. 306-307 : CHC = P / 2, « seulement pour les esprits libres » ; arrondi au supérieur (SR5 p. 50, règle générale).
// Grimoire des Ombres p. 203 : l'esprit libéré débute à 1 et grandit en jeu, d'où la valeur que le MJ peut saisir.

describe("H10 : la Chance d'un esprit libre", () => {
  it("vaut Puissance / 2 arrondie au supérieur par défaut", () => {
    expect(FREE_SPIRIT_EDGE_DEFAULT(5)).toBe(3)
    expect(FREE_SPIRIT_EDGE_DEFAULT(6)).toBe(3)
    expect(freeSpiritEdge(7, null)).toBe(4)
    expect(freeSpiritEdge(undefined, null)).toBe(0)
  })

  it("prend la valeur que le MJ a saisie (Grimoire p. 203), 0 compris", () => {
    expect(freeSpiritEdge(8, 1)).toBe(1)
    expect(freeSpiritEdge(8, 0)).toBe(0)
    expect(freeSpiritEdge(8, "")).toBe(4)
  })

  it("la case et la valeur vivent dans le registre du MJ, jamais sur la fiche", () => {
    expect(SPIRIT_TRAITS).toContain('isFree')
    expect(SPIRIT_VALUES).toContain('freeEdge')
    let ledger = withSpiritTrait({
      spirits: {
      }
    }, 's1', 'isFree', true)
    ledger = withSpiritTrait(ledger, 's1', 'freeEdge', '2')
    expect(spiritEntry(ledger, 's1')).toMatchObject({
      isFree: true, freeEdge: 2
    })
    expect(spiritEntry(withSpiritTrait(ledger, 's1', 'freeEdge', ''), 's1').freeEdge).toBeNull()
    expect(spiritEntry(withSpiritTrait(ledger, 's1', 'freeEdge', -4), 's1').freeEdge).toBe(0)
  })

  it("un jeton non lié sans valeur garde celle de son acteur", () => {
    let ledger = withSpiritTrait({
      spirits: {
      }
    }, 'a1', 'freeEdge', 2)
    ledger = withSpiritTrait(ledger, 'tok', 'isFree', true)
    expect(spiritTraitsFor(ledger, 'a1', 'tok')).toMatchObject({
      isFree: true, freeEdge: 2
    })
  })
})

describe("H10 : qui paie la Chance d'un esprit libre", () => {
  const summoner = {
    type: 'actorPc', update: vi.fn(), system: {
      specialAttributes: {
        edge: {
          augmented: {
            value: 3
          }
        }
      },
      conditionMonitors: {
        edge: {
          actual: {
            value: 0, base: 0
          }
        }
      }
    }
  }
  const freeSpirit = (spent, magicPact = false) => ({
    type: 'actorSpirit', update: vi.fn(), system: {
      creatorId: 'pc1', isFree: true, magicPact,
      specialAttributes: {
        edge: {
          augmented: {
            value: 2
          }
        }
      },
      conditionMonitors: {
        edge: {
          actual: {
            value: spent, base: spent
          }
        }
      }
    }
  })
  const dialog = {
    test: {
      type: 'spell'
    }
  }

  beforeEach(() => {
    summoner.update.mockClear()
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'pc1' ? summoner : undefined))
  })

  it("dépense sa propre Chance", async () => {
    const spirit = freeSpirit(0)
    expect(await SR5_RollTestHelper.determineEdgeActor(spirit)).toBe(spirit)
    await SR5_RollTestHelper.removeEdgeFromActor({
    }, spirit)
    expect(spirit.update).toHaveBeenCalledWith({
      "system.conditionMonitors.edge.actual.base": 1
    })
    expect(summoner.update).not.toHaveBeenCalled()
  })

  it("sans pacte, jamais celle de son ancien invocateur", async () => {
    expect(await SR5_RollTestHelper.canUseEdge(freeSpirit(2), dialog)).toBe(false)
  })

  it("sous un pacte de magie, celle du personnage une fois la sienne épuisée", async () => {
    expect(await SR5_RollTestHelper.determineEdgeActor(freeSpirit(2, true))).toBe(summoner)
  })
})
