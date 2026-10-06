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

// H9 (décision de DjamZ, 06/10, qui revient sur G7) : SR5 p. 306, « Esprits et Chance » : les esprits invoqués et liés
// n'ont pas leur propre réserve de Chance, mais « l'invocateur peut dépenser sa propre réserve de Chance pour les tests
// des esprits à son service s'il le désire ». La règle générale de la p. 58 cède devant cette exception.

const summoner = {
  type: 'actorPc', isOwner: true, update: vi.fn(), system: {
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
  type: 'actorSpirit', id: 'sp1', update: vi.fn(), system: {
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
  //The summoner the active GM wrote in the spirit ledger when he created the spirit
  globalThis.game = {
    settings: {
      get: () => ({
        summoners: {
          sp1: 'pc1'
        }
      })
    }
  }
})

describe("H9 : la Chance de l'invocateur (SR5 p. 306)", () => {
  it("l'invocateur dépense sa Chance pour le test de son esprit, sans pacte", async () => {
    expect(await SR5_RollTestHelper.canUseEdge(spirit(false), dialog)).toBe(true)
    expect(await SR5_RollTestHelper.determineEdgeActor(spirit(false))).toBe(summoner)
    await SR5_RollTestHelper.removeEdgeFromActor({
    }, spirit(false))
    expect(summoner.update).toHaveBeenCalledWith({
      "system.conditionMonitors.edge.actual.base": 1
    })
  })

  // Victoire's review: the creatorId is written by the spirit's owner, it is never believed
  it("un creatorId réécrit par la propriétaire ne donne aucune Chance : seul le registre du MJ nomme l'invocateur", async () => {
    const forged = {
      type: 'actorSpirit', id: 'sp2', update: vi.fn(), system: {
        creatorId: 'pc1'
      }
    }
    expect(await SR5_RollTestHelper.canUseEdge(forged, dialog)).toBe(false)
    expect(await SR5_RollTestHelper.determineEdgeActor(forged)).toBe(forged)
  })

  it("un invocateur que l'utilisateur ne peut pas écrire ne prête pas sa Chance", async () => {
    summoner.isOwner = false
    try {
      expect(await SR5_RollTestHelper.canUseEdge(spirit(false), dialog)).toBe(false)
    } finally {
      summoner.isOwner = true
    }
  })

  it("plus de Chance chez l'invocateur : l'esprit ne peut plus en dépenser", async () => {
    summoner.system.conditionMonitors.edge.actual.value = 3
    try {
      expect(await SR5_RollTestHelper.canUseEdge(spirit(false), dialog)).toBe(false)
    } finally {
      summoner.system.conditionMonitors.edge.actual.value = 0
    }
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
