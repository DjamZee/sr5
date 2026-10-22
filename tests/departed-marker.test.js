import {
  describe, it, expect, vi
} from 'vitest'

const {
  departedMarkerTraces, forgetDepartedMarker
} = await import('../modules/system/departed-marker.js')

const deck = (extra = {
}) => ({
  type: "itemDevice", system: {
    marks: [], markedItems: [], ...extra
  }
})

describe("departedMarkerTraces (SR5 p. 236)", () => {
  it("merges the persona's and the devices' marked items, without twins", () => {
    const actor = {
      system: {
        matrix: {
          markedItems: [{
            uuid: "Actor.A.Item.1", value: 1
          }], marks: []
        }
      },
      items: [deck({
        markedItems: [{
          uuid: "Actor.A.Item.1", value: 1
        }, {
          uuid: "Actor.B.Item.2", value: 2
        }]
      })],
    }
    expect(departedMarkerTraces(actor).marked.map(m => m.uuid)).toEqual(["Actor.A.Item.1", "Actor.B.Item.2"])
  })

  it("lists once each icon that marked it, on its persona or its devices", () => {
    const actor = {
      system: {
        matrix: {
          marks: [{
            ownerId: "D", value: 1
          }]
        }
      },
      items: [deck({
        marks: [{
          ownerId: "D", value: 2
        }, {
          ownerId: "T", value: 1
        }]
      }), {
        type: "itemWeapon", system: {
        }
      }],
    }
    expect(departedMarkerTraces(actor).markers).toEqual(["D", "T"])
  })

  it("leaves nothing for a missing actor (the base of an unlinked token already gone)", () => {
    expect(departedMarkerTraces(null)).toEqual({
      marked: [], markers: []
    })
  })
})

describe("forgetDepartedMarker", () => {
  it("takes its marks off their targets, under the id they bear, then the traces its markers kept", async () => {
    const helpers = {
      deleteMarksOnActor: vi.fn(), deleteMarkInfo: vi.fn()
    }
    const actor = {
      uuid: "Scene.S.Token.T.Actor.A",
      system: {
        matrix: {
          markedItems: [], marks: []
        }
      },
      items: [deck({
        markedItems: [{
          uuid: "Actor.D.Item.1", value: 1
        }], marks: [{
          ownerId: "D", value: 1
        }]
      })],
    }
    await forgetDepartedMarker(actor, "T", helpers)
    expect(helpers.deleteMarksOnActor).toHaveBeenCalledWith({
      matrix: {
        markedItems: [{
          uuid: "Actor.D.Item.1", value: 1
        }]
      }
    }, "T")
    expect(helpers.deleteMarkInfo).toHaveBeenCalledWith("D", "Scene.S.Token.T.Actor.A.")
  })

  it("does nothing for an actor that neither marked nor was marked", async () => {
    const helpers = {
      deleteMarksOnActor: vi.fn(), deleteMarkInfo: vi.fn()
    }
    await forgetDepartedMarker({
      uuid: "Actor.A", system: {
        matrix: {
        }
      }, items: [deck()]
    }, "A", helpers)
    expect(helpers.deleteMarksOnActor).not.toHaveBeenCalled()
    expect(helpers.deleteMarkInfo).not.toHaveBeenCalled()
  })
})
