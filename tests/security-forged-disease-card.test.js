import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Security pass of 06/10 (Kurt): a disease roll is a chat card, written by its author, flags included. The GM's
// Apply button shows only on a card written by a GM or by an owner of the infected character, the window starts from
// the hits counted on the dice (never those the card claims), and one request opens one window, whatever the number
// of renders of its card.
const {
  addDiseaseApplyButton, diseaseCardTrusted, diseaseCardHits, profileFromToxin, newInfection
} = await import("../modules/system/diseases.js")

const profile = () => profileFromToxin({
  name: "Masque rouge", system: {
    vector: {
      inhalation: true
    }, power: 4, penetration: 0, effect: {
    },
    pathogen: {
      interval: {
        value: 1, unit: "day"
      }, minTests: 6, effect: {
      }
    },
  },
})

const owner = {
  id: "clo", isGM: false
}
const stranger = {
  id: "other", isGM: false
}
const gm = {
  id: "gm", isGM: true
}
const infected = {
  testUserPermission: (u) => u.id === "clo",
  system: {
    specialAttributes: {
      edge: {
        augmented: {
          value: 3
        }
      }
    },
    resistances: {
      disease: {
        inhalation: {
          modifiers: [{
            type: "linkedAttribute", value: 3
          }, {
            type: "linkedAttribute", value: 2
          }]
        }
      }
    }
  }
}
// Dice as a card keeps them (roll-test.js rollDice): the first five are the pool of 3 + 2
const dice = (...faces) => ({
  terms: [{
    results: faces.map(result => ({
      result, active: true
    }))
  }]
})

const card = (author, hits, r) => ({
  author, flags: {
    sr5data: {
      disease: {
        infectionId: "i1", token: "t1"
      }, roll: {
        hits, r
      }, edge: {
      }
    }
  }
})

let buttons
beforeEach(() => {
  buttons = []
  globalThis.game = {
    user: gm, users: {
      activeGM: gm
    },
    settings: {
      get: () => ({
        infections: {
          i1: {
            ...newInfection(profile(), {
              id: "i1", actorUuid: "Actor.clo", actorName: "Clo", now: 0, startYear: 2075
            }), state: "active", request: {
              token: "t1", power: 4
            }
          }
        }
      })
    },
    i18n: {
      localize: (k) => k, format: (k, d) => `${k}:${JSON.stringify(d ?? {
      })}`
    },
  }
  globalThis.fromUuidSync = () => infected
  globalThis.fromUuid = async () => infected
  globalThis.document = {
    createElement: () => {
      const el = {
        classList: {
          add(){
          }
        }, dataset: {
        }, remove: vi.fn(), addEventListener: (_e, fn) => {
          el.click = fn
        }
      }
      buttons.push(el)
      return el
    }
  }
})

const render = (message) => {
  const placed = []
  addDiseaseApplyButton(message, {
    querySelector: () => ({
      after: (b) => placed.push(b)
    })
  })
  return placed
}

const withPrompt = (prompt) => {
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          prompt
        }
      }
    }, utils: {
      randomID: () => "r"
    }
  }
}

describe("who may stand behind a disease roll", () => {
  it("a GM, or an owner of the infected character; nobody else", () => {
    expect(diseaseCardTrusted(gm, infected)).toBe(true)
    expect(diseaseCardTrusted(owner, infected)).toBe(true)
    expect(diseaseCardTrusted(stranger, infected)).toBe(false)
    expect(diseaseCardTrusted(null, infected)).toBe(false)
  })

  it("no Apply button on a card forged by a player who does not own the character", () => {
    expect(render(card(stranger, 5, dice(5, 5, 5, 5, 5)))).toHaveLength(0)
    expect(render(card(owner, 1, dice(5, 1, 1, 1, 1)))).toHaveLength(1)
  })
})

describe("the hits the GM's window starts from", () => {
  it("are counted on the dice of a player's card, within the pool", () => {
    // claims 5, shows one hit in its five dice, a sixth die past the pool
    expect(diseaseCardHits({
      roll: {
        hits: 5, r: dice(5, 1, 2, 3, 4, 6)
      }
    }, false, 5)).toBe(1)
    expect(diseaseCardHits({
      roll: {
        hits: 5
      }
    }, false, 5)).toBe(null)
    expect(diseaseCardHits({
      roll: {
        hits: 3
      }
    }, true, 5)).toBe(3)
  })

  it("a forged card claiming hits within the pool is not taken at its word", async () => {
    const contents = []
    withPrompt(vi.fn(async (o) => {
      contents.push(o.content)
      return null
    }))
    render(card(owner, 5, dice(5, 1, 1, 1, 1)))
    await buttons[0].click()
    expect(contents[0]).toContain('value="1"')
    expect(contents[0]).toContain("SR5.DISEASE_HitsOnDice")
  })

  it("a card that shows no dice leaves the field empty", async () => {
    const contents = []
    withPrompt(vi.fn(async (o) => {
      contents.push(o.content)
      return null
    }))
    render(card(owner, 4, undefined))
    await buttons[0].click()
    expect(contents[0]).toContain('value=""')
    expect(contents[0]).toContain("SR5.DISEASE_NoDice")
  })
})

// Bodo's second round: a chain of forged sixes never ends, so no recount bounds it. The window never starts above the
// pool plus Chance the GM works out: past it, an empty field and an alert, the GM keeps his own figure (Élise, 06/10)
describe("a card that pushed the limit with forged sixes", () => {
  it("leaves the field empty past the pool and Chance", async () => {
    const contents = []
    withPrompt(vi.fn(async (o) => {
      contents.push(o.content)
      return null
    }))
    const forged = card(owner, 12, {
      terms: [{
        results: [...new Array(8).fill(6).map(result => ({
          result, active: true
        })), ...new Array(30).fill(6).map(result => ({
          result, active: true, ruleOfSix: true
        }))]
      }]
    })
    forged.flags.sr5data.edge = {
      hasUsedPushTheLimit: true
    }
    render(forged)
    await buttons[0].click()
    // pool 5 + Chance 3 = 8: 38 hits on the dice do not prefill anything
    expect(contents[0]).toContain('value=""')
    expect(contents[0]).toContain("SR5.DISEASE_HitsAboveCeiling")
  })
})

describe("one request, one window", () => {
  it("two renders of the same card open one window between them", async () => {
    let release
    const prompt = vi.fn(() => new Promise(r => {
      release = r
    }))
    withPrompt(prompt)
    const message = card(owner, 1, dice(5, 1, 1, 1, 1))
    render(message)
    render(message)
    const first = buttons[0].click()
    await buttons[1].click()
    await new Promise(r => setTimeout(r, 0))
    expect(prompt).toHaveBeenCalledTimes(1)
    release(null)
    await first
  })
})
