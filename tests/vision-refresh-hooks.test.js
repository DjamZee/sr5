import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  sr5HookUpdateActor
} from "../modules/hooks/actor.js"
import {
  sr5HookCreateItem, sr5HookItemVision
} from "../modules/hooks/item.js"

// The sheet pins an item by updating the actor with its items : the updateItem hook then still
// reads the actor as it was, and the tokens kept the vision the cybereyes had just taken away.
describe("the tokens are served again after an item change", () => {
  let savedUser
  beforeEach(() => {
    savedUser = game.user
    game.user = {
      id: "me"
    }
    vi.spyOn(SR5_CharacterUtility, "refreshVisionOfTokens").mockResolvedValue()
  })
  afterEach(() => {
    game.user = savedUser
    vi.restoreAllMocks()
  })

  const actor = {
    type: "actorPc", items: [], testUserPermission: () => false
  }

  it("when the sheet pins an item through its actor", async () => {
    await sr5HookUpdateActor(actor, {
      items: [{
      }]
    }, {
    }, "me")
    expect(SR5_CharacterUtility.refreshVisionOfTokens).toHaveBeenCalledWith(actor)
  })

  it("by the user who made the change only", async () => {
    await sr5HookUpdateActor(actor, {
      items: [{
      }]
    }, {
    }, "someone else")
    await sr5HookItemVision({
      isOwned: true, parent: actor
    }, "someone else")
    expect(SR5_CharacterUtility.refreshVisionOfTokens).not.toHaveBeenCalled()
  })

  it("not on an actor update that leaves the items alone", async () => {
    await sr5HookUpdateActor(actor, {
      system: {
      }
    }, {
    }, "me")
    expect(SR5_CharacterUtility.refreshVisionOfTokens).not.toHaveBeenCalled()
  })

  it("when an item is added to an actor", async () => {
    await sr5HookCreateItem({
      isOwned: true, parent: actor
    }, {
    }, "me")
    expect(SR5_CharacterUtility.refreshVisionOfTokens).toHaveBeenCalledWith(actor)
  })
})
