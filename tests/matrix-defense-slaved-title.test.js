import {
  describe, it, expect, beforeAll, afterAll, vi
} from "vitest"

//The matrix card as a GM wrote it: its reading again is tested in matrix-card.test.js
vi.mock('../modules/rolls/roll-helpers/matrix-card.js', () => ({
  trustedMatrixAction: async chatData => ({
    hits: chatData?.roll?.hits, actionType: chatData?.matrix?.actionType
  }),
  cardStandsFor: async () => true,
  trustedDefenderDamage: async (id, claimed) => claimed,
  damageReachable: () => true,
  tellMatrixCard: async () => {},
}))
import matrixDefense from "../modules/rolls/roll-prepare-case/rollData-MatrixDefense.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"

// l. 778: the defense of a device slaved to a PAN names the device, like an unslaved one
const defense = {
  defense: {
    modifiers: [{
      source: "Volonté", type: "linkedAttribute", value: 4
    }], dicePool: 9
  }, increaseOverwatchScore: false
}
const owner = {
  type: "actorPc", items: [], system: {
    matrix: {
      actions: {
        dataSpike: defense
      }
    }, specialProperties: {
    }
  }
}

let savedFromUuid
beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize ??= (key) => key
  savedFromUuid = globalThis.fromUuid
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue(owner)
})
afterAll(() => {
  globalThis.fromUuid = savedFromUuid
  vi.restoreAllMocks()
})

const chatData = {
  roll: {
    hits: 3
  }, target: {
    itemUuid: "Item.gun"
  }, matrix: {
  }, owner: {
    actorId: "a1", messageId: "m1"
  },
}
const rollData = () => ({
  test: {
  }, dicePool: {
  }, target: {
  }, combat: {
    activeDefenses: {
    }
  }, matrix: {
  }, previousMessage: {
  },
})

describe("matrix defense of a device", () => {
  it.each([true, false])("names the device (slaved to a PAN: %s)", async (slaved) => {
    globalThis.fromUuid = async () => ({
      name: "Ares Predator", system: {
        type: "weapon", isSlavedToPan: slaved, panMaster: "a1", deviceRating: 2
      }
    })
    const data = await matrixDefense(rollData(), "dataSpike", owner, chatData)
    expect(data.test.title.startsWith("Ares Predator - ")).toBe(true)
  })
})
