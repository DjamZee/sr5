import {
  describe, it, expect, vi, beforeEach
} from "vitest"

// Security pass of 06/10 (Kurt, asked by Élise after Bodo's review, D2 of Liesel): the radiation roll gets what the
// disease roll got. The GM's Apply button shows only on a card written by a GM or by an owner of the exposed
// character; the window starts from the hits counted on the dice, never above the pool plus Chance the GM works out;
// one request opens one window, whatever the number of renders of its card.
const {
  addRadiationApplyButton
} = await import("../modules/system/radiation.js")

const owner = {
  id: "clo", isGM: false
}
const stranger = {
  id: "other", isGM: false
}
const gm = {
  id: "gm", isGM: true
}
// Body 3 + Willpower 2 = 5, Chance 3
const exposed = {
  testUserPermission: (u) => u.id === "clo",
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
      edge: {
        augmented: {
          value: 3
        }
      }
    }
  }
}

const dice = (kept, rerolls = []) => ({
  terms: [{
    results: [...kept.map(result => ({
      result, active: true
    })), ...rerolls.map(result => ({
      result, active: true, ruleOfSix: true
    }))]
  }]
})

const card = (author, hits, r, pushed = false) => ({
  author, flags: {
    sr5data: {
      radiation: {
        exposureId: "e1", token: "t1"
      }, roll: {
        hits, r
      }, edge: {
        hasUsedPushTheLimit: pushed
      }
    }
  }
})

let buttons, contents, prompt
beforeEach(() => {
  buttons = []
  contents = []
  prompt = vi.fn(async (o) => {
    contents.push(o.content)
    return null
  })
  globalThis.game = {
    user: gm, users: {
      activeGM: gm
    },
    settings: {
      get: () => ({
        exposures: {
          e1: {
            id: "e1", actorUuid: "Actor.clo", actorName: "Clo", level: 4, testsDone: 0, request: {
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
  globalThis.fromUuidSync = () => exposed
  globalThis.fromUuid = async () => exposed
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
  globalThis.foundry = {
    ...globalThis.foundry,
    applications: {
      api: {
        DialogV2: {
          prompt
        }
      }
    },
    utils: {
      ...globalThis.foundry?.utils, escapeHTML: (t) => t
    }
  }
})

const render = (message) => {
  const placed = []
  addRadiationApplyButton(message, {
    querySelector: () => ({
      after: (b) => placed.push(b)
    })
  })
  return placed
}

describe("a forged radiation roll", () => {
  it("has no Apply button when written by a player who does not own the character", () => {
    expect(render(card(stranger, 2, dice([5, 5, 1, 1, 1])))).toHaveLength(0)
    expect(render(card(owner, 2, dice([5, 5, 1, 1, 1])))).toHaveLength(1)
  })

  it("starts from the hits on its dice, not from those it claims", async () => {
    render(card(owner, 5, dice([5, 1, 1, 1, 1])))
    await buttons[0].click()
    expect(contents[0]).toContain('value="1"')
    expect(contents[0]).toContain("SR5.DISEASE_HitsOnDice")
  })

  it("leaves the field empty when it shows no dice", async () => {
    render(card(owner, 4, undefined))
    await buttons[0].click()
    expect(contents[0]).toContain('value=""')
    expect(contents[0]).toContain("SR5.DISEASE_NoDice")
  })

  it("never prefills above pool + Chance, whatever sixes it writes", async () => {
    render(card(owner, 12, dice(new Array(8).fill(6), new Array(30).fill(6)), true))
    await buttons[0].click()
    expect(contents[0]).toContain('value=""')
    expect(contents[0]).toContain("SR5.DISEASE_HitsAboveCeiling")
  })

  it("two renders of one card open one window", async () => {
    let release
    prompt.mockImplementation(() => new Promise(r => {
      release = r
    }))
    const message = card(owner, 1, dice([5, 1, 1, 1, 1]))
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
