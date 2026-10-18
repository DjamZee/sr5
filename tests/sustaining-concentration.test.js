import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game,
    i18n: {
      localize: key => key,
    },
  }
})

/** A technomancer sustaining one complex form of the given Level */
function actor(level, concentration) {
  return {
    type: "actorPc",
    items: [{
      id: "cf1", name: "Forme", type: "itemComplexForm", system: {
        isActive: true, freeSustain: false, level
      }
    }],
    system: {
      matrix: {
        submersionGrade: 0, concentration: false
      },
      specialProperties: {
        concentration: {
          value: concentration
        }
      },
      penalties: {
        matrix: {
          actual: {
            base: 0, value: 0, modifiers: []
          }
        }
      },
    },
  }
}

describe("Concentration au maintien d'une forme complexe", () => {
  it("une forme de Niveau 0 sans Concentration garde son malus", () => {
    const a = actor(0, 0)
    SR5_CharacterUtility.handleSustaining(a, "itemComplexForm", "matrix")
    const types = a.system.penalties.matrix.actual.modifiers.map(m => m.type)
    expect(types).toContain("itemComplexForm")
    expect(types).not.toContain("concentration")
    expect(a.items[0].system.freeSustain).toBe(false)
  })

  it("une Concentration de 2 couvre une forme de Niveau 2", () => {
    const a = actor(2, 2)
    SR5_CharacterUtility.handleSustaining(a, "itemComplexForm", "matrix")
    const types = a.system.penalties.matrix.actual.modifiers.map(m => m.type)
    expect(types).toContain("concentration")
    expect(a.items[0].system.freeSustain).toBe(true)
  })
})
