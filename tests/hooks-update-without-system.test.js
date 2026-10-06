import {
  describe, it, expect, beforeEach, afterEach, vi
} from "vitest"
import {
  SR5_CharacterUtility
} from "../modules/entities/actors/utilityActor.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"
import {
  sr5HookUpdateActor
} from "../modules/hooks/actor.js"
import {
  sr5HookUpdateItem
} from "../modules/hooks/item.js"

// C5: an update that carries no system (a name, a flag, an embedded change) must not break the
// update hooks of a deck or an agent, and the deck/agent synchro only runs on a matrix monitor change.
describe("update hooks without system", () => {
  let savedUser, savedCombat, savedActors
  beforeEach(() => {
    savedUser = game.user
    savedCombat = game.combat
    savedActors = game.actors
    game.user = {
      id: "me", isGM: true
    }
    game.combat = null
    game.actors = [{
      type: "actorAgent", system: {
        creatorId: "pc1"
      }
    }]
    vi.spyOn(SR5_CharacterUtility, "refreshVisionOfTokens").mockResolvedValue()
    vi.spyOn(SR5_ActorHelper, "keepAgentMonitorSynchro").mockResolvedValue()
    vi.spyOn(SR5_ActorHelper, "keepDeckSynchroWithAgent").mockResolvedValue()
  })
  afterEach(() => {
    game.user = savedUser
    game.combat = savedCombat
    game.actors = savedActors
    vi.restoreAllMocks()
  })

  const parent = {
    id: "pc1", type: "actorPc"
  }
  const item = (type) => ({
    type, isOwned: true, parent, actor: parent, testUserPermission: () => true
  })
  const agent = {
    type: "actorAgent", items: [], testUserPermission: () => true
  }

  it("a deck updated without system does not throw", async () => {
    await expect(sr5HookUpdateItem(item("itemDevice"), {
      name: "Deck"
    }, {
    }, "me")).resolves.toBeUndefined()
    expect(SR5_ActorHelper.keepAgentMonitorSynchro).not.toHaveBeenCalled()
  })

  it("an agent updated without system does not throw", async () => {
    await expect(sr5HookUpdateActor(agent, {
      name: "Agent"
    }, {
    }, "me")).resolves.toBeUndefined()
    expect(SR5_ActorHelper.keepDeckSynchroWithAgent).not.toHaveBeenCalled()
  })

  it("the GM does not resync the agents on any item of the owner", async () => {
    await sr5HookUpdateItem(item("itemWeapon"), {
      system: {
        conditionMonitors: {
          matrix: {
            actual: 1
          }
        }
      }
    }, {
    }, "me")
    expect(SR5_ActorHelper.keepAgentMonitorSynchro).not.toHaveBeenCalled()
  })

  it("a deck matrix damage still resyncs its agent", async () => {
    await sr5HookUpdateItem(item("itemDevice"), {
      system: {
        conditionMonitors: {
          matrix: {
            actual: 1
          }
        }
      }
    }, {
    }, "me")
    expect(SR5_ActorHelper.keepAgentMonitorSynchro).toHaveBeenCalledOnce()
  })
})
