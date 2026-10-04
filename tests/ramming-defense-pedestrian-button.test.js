import {
  describe, it, expect, vi
} from "vitest"

vi.mock("../modules/rolls/roll-message.js", () => ({
  SR5_RollMessage: {
    generateChatButton: (cls, action, label) => ({
      cls, action, label
    }),
  },
}))
vi.mock("../modules/rolls/roll-test.js", () => ({
  SR5_RollTest: {
    rollDice: vi.fn(async () => ({
      hits: 0
    })), renderRollCard: vi.fn(),
  },
}))
vi.mock("../modules/rolls/roll-prepare.js", () => ({
  SR5_PrepareRollTest: {
    getBaseRollData: () => ({
      test: {
      }, damage: {
      }, target: {
      }, chatCard: {
        buttons: {
        }
      }
    }),
  },
}))

const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  default: defenseInfo
} = await import("../modules/rolls/roll-test-case/test-Defense.js")

const makeDefender = type => ({
  type, items: [], system: {
    attributes: {
      body: {
        augmented: {
          value: 4
        }
      }, armor: {
        augmented: {
          value: 0
        }
      }
    }
  },
})

const makeCard = () => ({
  previousMessage: {
    hits: 3, actorId: "rammer"
  }, roll: {
    hits: 0
  }, test: {
    type: "rammingDefense"
  },
  damage: {
    base: 6
  }, magic: {
    spell: {
    }
  },
  combat: {
    firingMode: {
    }, ammo: {
    }, calledShot: {
      effects: []
    }, ramming: {
      relativeSpeed: 60, attackerSpeed: 3, targetSpeed: 0
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

// Rigger 5 p. 179: the defender's piloting test only exists for a vehicle (N85)
describe("Ramming defense, piloting test button", () => {
  it.each([
    ["actorPc", false], ["actorDrone", true]
  ])("is offered to a %s defender: %s", async (type, offered) => {
    globalThis.game.i18n = {
      localize: k => k, format: k => k
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(id => id === "def" ? makeDefender(type) : makeDefender("actorDrone"))
    const card = makeCard()
    await defenseInfo(card, "def")
    expect(Boolean(card.chatCard.buttons.vehicleTest)).toBe(offered)
  })
})
