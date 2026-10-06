import {
  describe, it, expect, vi, beforeEach
} from "vitest"

const {
  addRadiationApplyButton
} = await import("../modules/system/radiation.js")

// The GM's Apply window on a radiation roll (Yolande, 06/10): a double click opened two windows, and the pool + Edge
// cap cut true hits of a roll that pushed the limit, whose sixes explode (SR5 p. 56 VO, p. 58 VF)
describe("the GM's Apply button on a radiation roll", () => {
  let listener
  beforeEach(() => {
    globalThis.game = {
      user: {
        id: "gm", isGM: true
      }, users: {
        activeGM: {
          id: "gm"
        }
      },
      settings: {
        get: () => ({
          exposures: {
            e1: {
              id: "e1", actorUuid: "Actor.a", actorName: "Ana", level: 4, testsDone: 0, request: {
                token: "t1", power: 4
              }
            }
          }
        })
      },
      i18n: {
        localize: (k) => k, format: (k) => k
      },
    }
    const el = {
      classList: {
        add(){
        }
      }, dataset: {
      }, addEventListener: (_e, fn) => {
        listener = fn
      }, remove: vi.fn()
    }
    globalThis.document = {
      createElement: () => el
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
          edge: {
            augmented: {
              value: 3
            }
          }
        }
      }
    })
  })
  // A card of the exposed character's owner (the author check of Kurt's security pass)
  globalThis.fromUuidSync = () => ({
    testUserPermission: (u) => u.id === "p"
  })
  const card = (hits, pushed) => ({
    author: {
      id: "p", isGM: false
    },
    flags: {
      sr5data: {
        radiation: {
          exposureId: "e1", token: "t1"
        }, roll: {
          hits
        }, edge: {
          hasUsedPushTheLimit: pushed
        }
      }
    }
  })
  const stubPrompt = (prompt) => {
    globalThis.foundry = {
      applications: {
        api: {
          DialogV2: {
            prompt
          }
        }
      },
      utils: {
        escapeHTML: (t) => t
      }
    }
  }

  it("a double click opens one window only", async () => {
    let release
    const prompt = vi.fn(() => new Promise(r => {
      release = r
    }))
    stubPrompt(prompt)
    addRadiationApplyButton(card(2, false), {
      querySelector: () => ({
        after(){
        }
      })
    })
    const first = listener()
    await listener()
    await new Promise(r => setTimeout(r, 0))
    expect(prompt).toHaveBeenCalledTimes(1)
    release(null)
    await first
  })

  it("past pool + Edge on a pushed roll: warned, but the field has no cap", async () => {
    const contents = []
    stubPrompt(vi.fn(async (o) => {
      contents.push(o.content)
      return null
    }))
    addRadiationApplyButton(card(10, true), {
      querySelector: () => ({
        after(){
        }
      })
    })
    await listener()
    expect(contents[0]).toContain("SR5.DISEASE_HitsAbovePool")
    expect(contents[0]).not.toContain("max=")
  })
})
