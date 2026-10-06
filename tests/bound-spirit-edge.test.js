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
  SPIRIT_TRAITS, withSpiritTrait, spiritEntry
} = await import('../modules/system/spirit-ledger.js')

// G7 (décision de DjamZ, 06/10) : « Un joueur ne peut dépenser des points de Chance que sur les propres actions de son
// personnage » (SR5 p. 58) : un esprit lié ne dépense pas la Chance de son invocateur. Seul le pacte de magie d'un
// esprit libre le permet (Grimoire des Ombres p. 133).

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
const spirit = magicPact => ({
  type: 'actorSpirit', update: vi.fn(), system: {
    creatorId: 'pc1', magicPact
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

describe("G7 : la Chance de l'invocateur", () => {
  it("un esprit lié ne peut pas dépenser la Chance de son invocateur", async () => {
    expect(await SR5_RollTestHelper.canUseEdge(spirit(false), dialog)).toBe(false)
    expect(await SR5_RollTestHelper.determineEdgeActor(spirit(false))).not.toBe(summoner)
    await SR5_RollTestHelper.removeEdgeFromActor({
    }, spirit(false))
    expect(summoner.update).not.toHaveBeenCalled()
  })

  it("sous un pacte de magie, l'esprit dépense la Chance du personnage", async () => {
    expect(await SR5_RollTestHelper.canUseEdge(spirit(true), dialog)).toBe(true)
    expect(await SR5_RollTestHelper.determineEdgeActor(spirit(true))).toBe(summoner)
    await SR5_RollTestHelper.removeEdgeFromActor({
    }, spirit(true))
    expect(summoner.update).toHaveBeenCalledWith({
      "system.conditionMonitors.edge.actual.base": 1
    })
  })

  it("le pacte est un trait du registre du MJ, jamais lu sur la fiche", () => {
    expect(SPIRIT_TRAITS).toContain('magicPact')
    const ledger = withSpiritTrait({
      spirits: {
      }
    }, 's1', 'magicPact', true)
    expect(spiritEntry(ledger, 's1').magicPact).toBe(true)
  })
})
