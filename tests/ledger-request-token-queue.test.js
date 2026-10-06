import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  addRadiationApplyButton, RADIATION_LEDGER
} = await import("../modules/system/radiation.js")
const {
  addDiseaseApplyButton, DISEASE_LEDGER
} = await import("../modules/system/diseases.js")

// The request token of a disease or radiation test was read again after the GM's window, outside the register's
// queue (gm-ledger.js): two cards of the same request, confirmed together, both read it valid and both applied the
// test (Frank's queue, Lena's lead). The token is now read in the queue, just before the write.

let store, listeners, chats
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  store = {
    [RADIATION_LEDGER]: {
      exposures: {
        e1: {
          id: "e1", actorUuid: "Actor.a", actorName: "Ana", level: "moderate", testsDone: 0, request: {
            token: "t1", power: 4
          }
        }
      }
    },
    [DISEASE_LEDGER]: {
      infections: {
        i1: {
          id: "i1", actorUuid: "Actor.a", actorName: "Ana", vector: "contact", basePower: 4, testsDone: 0, carry: 0,
          residual: 0, treatment: 0, state: "active", nextTest: 0, history: [], request: {
            token: "t1", power: 4
          },
          profile: {
            name: "Grippe", power: 4, minTests: 3, interval: {
              value: 1, unit: "day"
            }, vectors: ["contact"], effects: [], pathogenEffects: [], penetration: 0
          },
        }
      }
    },
  }
  listeners = []
  chats = []
  const gm = {
    id: "gm", isGM: true
  }
  globalThis.game = {
    user: gm, users: {
      activeGM: gm, filter: () => []
    },
    time: {
      worldTime: 0
    },
    settings: {
      get: (_s, key) => store[key],
      set: async (_s, key, value) => {
        await tick()
        store[key] = JSON.parse(JSON.stringify(value))
        return value
      },
    },
    i18n: {
      localize: (k) => k, format: (k) => k
    },
  }
  globalThis.document = {
    createElement: () => ({
      classList: {
        add(){
        }
      }, dataset: {
      }, addEventListener: (_e, fn) => listeners.push(fn), remove: vi.fn()
    })
  }
  globalThis.fromUuid = async () => ({
    system: {
      attributes: {
        body: {
          augmented: {
            value: 3
          }
        }, willpower: {
          augmented: {
            value: 2
          }
        }
      }, specialAttributes: {
      }
    }, items: [], isToken: false, id: "a"
  })
  globalThis.fromUuidSync = () => null
  globalThis.canvas = {
    tokens: {
      placeables: []
    }
  }
  globalThis.ChatMessage = {
    create: async (data) => chats.push(data), getWhisperRecipients: () => []
  }
  globalThis.foundry = {
    ...globalThis.foundry,
    applications: {
      api: {
        DialogV2: {
          prompt: async () => 4
        }
      }
    },
    utils: {
      ...globalThis.foundry?.utils, escapeHTML: (t) => t, randomID: () => "x", deepClone: (o) => JSON.parse(JSON.stringify(o))
    }
  }
})

const anchor = {
  querySelector: () => ({
    after(){
    }
  })
}

describe("a test request applied by two cards at once", () => {
  it("radiation: one card applies it, the other finds the request gone", async () => {
    for (let i = 0; i < 2; i++) addRadiationApplyButton({
      // A GM's card: believed as written (the author check of Kurt's security pass)
      author: {
        id: "gm", isGM: true
      },
      flags: {
        sr5data: {
          radiation: {
            exposureId: "e1", token: "t1"
          }, roll: {
            hits: 4
          }
        }
      }
    }, anchor)
    expect(listeners).toHaveLength(2)

    listeners.forEach(fn => fn())
    for (let i = 0; i < 100; i++) await tick()
    expect(store[RADIATION_LEDGER].exposures.e1.testsDone).toBe(1)
    expect(chats).toHaveLength(1)
  })

  it("disease: one card applies it, the other finds the request gone", async () => {
    for (let i = 0; i < 2; i++) addDiseaseApplyButton({
      // A GM's card: believed as written (the author check of Kurt's security pass)
      author: {
        id: "gm", isGM: true
      },
      flags: {
        sr5data: {
          disease: {
            infectionId: "i1", token: "t1"
          }, roll: {
            hits: 4
          }
        }
      }
    }, anchor)
    expect(listeners).toHaveLength(2)

    listeners.forEach(fn => fn())
    for (let i = 0; i < 100; i++) await tick()
    expect(store[DISEASE_LEDGER].infections.i1.testsDone).toBe(1)
    expect(chats).toHaveLength(1)
  })
})
