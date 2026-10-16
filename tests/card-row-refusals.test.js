import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

// In Foundry V13 ui.notifications.warn returns the notification, a truthy value: a row action that returned it
// was read as done, and its row was marked done although nothing was rolled, shown or applied
const markRowDoneInMessage = vi.fn(async () => {})
vi.mock("../modules/system/card-rows.js", () => ({
  markRowDoneInMessage, cardFromGM: message => !!message?.author?.isGM
}))

const {
  activateDeadlineCardListeners
} = await import("../modules/system/deadlines.js")
const {
  activateAIDissipationListeners
} = await import("../modules/system/ai-dissipation.js")

function clickable(dataset, rowDataset){
  const row = {
    dataset: rowDataset, closest: () => null, querySelector: () => null
  }
  const button = {
    dataset, disabled: false, removed: false, closest: () => row,
  }
  button.remove = () => {
    button.removed = true
  }
  button.addEventListener = (_type, handler) => {
    button.click = () => handler({
      currentTarget: button
    })
  }
  return button
}

let saved
beforeEach(() => {
  saved = {
    game: globalThis.game, fromUuid: globalThis.fromUuid, warn: globalThis.ui.notifications.warn
  }
  globalThis.game = {
    ...globalThis.game, user: {
      id: "gm", isGM: true
    }, users: {
      activeGM: {
        id: "gm"
      }
    }
  }
  globalThis.ui.notifications.warn = vi.fn(() => ({
    id: 1
  }))
  markRowDoneInMessage.mockClear()
})
afterEach(() => {
  globalThis.game = saved.game
  globalThis.fromUuid = saved.fromUuid
  globalThis.ui.notifications.warn = saved.warn
})

describe("a refused row action is not marked done", () => {
  it("withdrawal: an addiction that is gone leaves the row as it was", async () => {
    globalThis.fromUuid = async () => ({
      system: {
        addictions: []
      }
    })
    const button = clickable({
      sr5Deadline: "act"
    }, {
      kind: "addiction", actorUuid: "Actor.a", index: "0", name: "Novacoke"
    })
    activateDeadlineCardListeners({
      querySelectorAll: () => [button]
    }, {
      author: {
        isGM: true
      }
    })
    await button.click()
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledOnce()
    expect(markRowDoneInMessage).not.toHaveBeenCalled()
    expect(button.disabled).toBe(false)
  })

  it("reveal: no player or player-owner to show it to keeps the button", async () => {
    globalThis.fromUuid = async () => null
    const button = clickable({
      sr5Deadline: "reveal"
    }, {
      kind: "rent", actorUuid: "Actor.a"
    })
    activateDeadlineCardListeners({
      querySelectorAll: () => [button]
    }, {
      author: {
        isGM: true
      }
    })
    await button.click()
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledOnce()
    expect(button.removed).toBe(false)
    expect(button.disabled).toBe(false)
  })

  it("AI dissipation: an actor that is gone leaves the row as it was", async () => {
    globalThis.fromUuid = async () => null
    const button = clickable({
    }, {
      actorUuid: "Actor.gone"
    })
    activateAIDissipationListeners({
      querySelectorAll: () => [button]
    }, {
      id: "m1", author: {
        isGM: true
      }
    })
    await button.click()
    expect(globalThis.ui.notifications.warn).toHaveBeenCalledOnce()
    expect(markRowDoneInMessage).not.toHaveBeenCalled()
  })
})
