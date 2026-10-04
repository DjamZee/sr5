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
const renderRollCard = vi.fn()
vi.mock("../modules/rolls/roll-test.js", () => ({
  SR5_RollTest: {
    rollDice: vi.fn(async () => ({
      hits: 0
    })), renderRollCard,
  },
}))
vi.mock("../modules/rolls/roll-prepare.js", () => ({
  SR5_PrepareRollTest: {
    getBaseRollData: () => ({
      test: {
      }, damage: {
      }, combat: {
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

const spirit = {
  type: "actorSpirit", items: [], system: {
    specialProperties: {
      energyAura: "fire"
    },
    specialAttributes: {
      magic: {
        augmented: {
          value: 4
        }
      }
    },
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
    },
    itemsProperties: {
      armor: {
        value: 0
      }
    },
  },
}

const makeCard = defenseHits => ({
  previousMessage: {
    hits: 3, actorId: "attacker"
  }, roll: {
    hits: defenseHits
  }, test: {
    type: "defense", typeSub: "meleeWeapon"
  },
  damage: {
    base: 6, value: 6
  }, magic: {
    spell: {
    }
  },
  combat: {
    firingMode: {
    }, ammo: {
    }, calledShot: {
      effects: []
    }
  },
  chatCard: {
    buttons: {
    }
  },
})

// SR5 p. 397: only a successful attack against an energy aura burns the attacker
describe("Energy aura", () => {
  it("does not burn an attacker whose melee attack failed", async () => {
    globalThis.game.i18n = {
      localize: k => k, format: k => k
    }
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => spirit)
    renderRollCard.mockClear()
    await defenseInfo(makeCard(5), "spirit")
    expect(renderRollCard).not.toHaveBeenCalled()
  })

  it("burns an attacker whose melee attack hit", async () => {
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(() => spirit)
    renderRollCard.mockClear()
    // The rest of the defense needs a full spirit: only the aura card matters here
    await defenseInfo(makeCard(1), "spirit").catch(() => {})
    expect(renderRollCard).toHaveBeenCalledTimes(1)
  })
})
