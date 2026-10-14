import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForPlayer: vi.fn(async () => {}), emitForGM: vi.fn(async () => {}),
  },
}))
const {
  SR5_RollTestHelper
} = await import("../modules/rolls/roll-test-helper.js")

// Lot 16b: the point of Edge a crazy stunt (R5 p. 182) or a chase action paid as it was launched was lost when the
// player closed the test window without rolling. It comes back to the pilot.
describe("a chase action's Edge, given back when its test is not rolled", () => {
  let pilot
  beforeEach(() => {
    pilot = {
      isOwner: true, system: {
        conditionMonitors: {
          edge: {
            actual: {
              base: 2
            }
          }
        }
      },
      update: vi.fn(async () => {}),
    }
    globalThis.fromUuidSync = vi.fn(uuid => uuid === "Actor.pilot" ? pilot : null)
  })

  it("closing the window gives the pilot her point back", async () => {
    SR5_RollTestHelper.handleCanceledTest({
      flags: {
      }
    }, {
      dialogSwitch: {
      }, chase: {
        edgePilotUuid: "Actor.pilot"
      }
    })
    await Promise.resolve()
    expect(pilot.update).toHaveBeenCalledWith({
      "system.conditionMonitors.edge.actual.base": 1
    })
  })

  it("nothing for a chase test that spent no Edge, nor below zero", async () => {
    SR5_RollTestHelper.handleCanceledTest({
      flags: {
      }
    }, {
      dialogSwitch: {
      }, chase: {
        edgePilotUuid: null
      }
    })
    pilot.system.conditionMonitors.edge.actual.base = 0
    await SR5_RollTestHelper.refundEdge(pilot)
    expect(pilot.update).not.toHaveBeenCalled()
  })
})
