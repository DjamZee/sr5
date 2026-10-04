import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_RollMessage
} = await import("../modules/rolls/roll-message.js")

// An engulf toxin card (airEngulf) deletes the previous card when its button is used. With no GM, the player
// updates the card themselves, and the previous card may belong to someone else: Foundry refused the delete, which
// threw before the escape button was added. A card they cannot delete now stays.
describe("updateChatButton, engulf toxin", () => {
  let oldCard, card

  beforeEach(() => {
    globalThis.game.user = {
      id: "player", isGM: false
    }
    oldCard = {
      canUserModify: vi.fn(() => false), delete: vi.fn(async () => {})
    }
    card = {
      id: "new",
      flags: {
        sr5data: {
          owner: {
          },
          previousMessage: {
            messageId: "old"
          },
          damage: {
            base: 6, type: "physical", toxin: {
              type: "airEngulf"
            }
          },
          combat: {
          },
          edge: {
          },
          chatCard: {
            buttons: {
              toxinEffect: {
              }
            }
          },
        }
      },
      update: vi.fn(async () => {}),
    }
    globalThis.game.messages = {
      get: id => ({
        new: card, old: oldCard
      })[id]
    }
    vi.spyOn(SR5_RollMessage, "updateRollCardHelper").mockResolvedValue()
  })

  it("leaves a card the player cannot delete and still adds the escape button", async () => {
    await SR5_RollMessage.updateChatButton("new", "toxinEffect")
    expect(oldCard.canUserModify).toHaveBeenCalledWith(globalThis.game.user, "delete")
    expect(oldCard.delete).not.toHaveBeenCalled()
    const saved = SR5_RollMessage.updateRollCardHelper.mock.calls[0][1]
    expect(saved.chatCard.buttons.escapeEngulf).toBeDefined()
  })

  it("deletes it when they may", async () => {
    oldCard.canUserModify.mockReturnValue(true)
    await SR5_RollMessage.updateChatButton("new", "toxinEffect")
    expect(oldCard.delete).toHaveBeenCalledOnce()
  })
})
