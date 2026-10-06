import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Combat
} from "../modules/system/srcombat.js"
import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  sr5HookUpdateActor
} from "../modules/hooks/actor.js"

// SR5 p. 162 and 171: the wound modifier lowers the Initiative score, once per change of that modifier.
// An update of the base actor of unlinked tokens compared the base actor (unwounded) with the
// combatant of the first token (wounded): +1 to that combatant at every update (41 -> 42 -> 43)

const withInit = (value, dice = 1) => ({
  initiatives: {
    physicalInit: {
      isActive: true, value, dice: {
        value: dice
      }
    }
  }
})

let base, synth1, synth2, linked, c1, c2, c3, actors, savedUser, savedUsers, savedCombat
const fighter = (id, tokenId, actorId, actor, actorLink, initiative, rating) => ({
  id, tokenId, actorId, actor, initiative, name: id,
  token: {
    actorLink
  },
  flags: {
    sr5: {
      currentInitRating: rating, currentInitDice: 1, hasPlayed: false
    }
  },
  combat: {
    current: {
      combatantId: id
    }
  },
  update: vi.fn(async function (data){
    if ("initiative" in data) this.initiative = data.initiative
    this.flags.sr5.currentInitRating = data["flags.sr5.currentInitRating"] ?? this.flags.sr5.currentInitRating
    this.flags.sr5.currentInitDice = data["flags.sr5.currentInitDice"] ?? this.flags.sr5.currentInitDice
  })
})

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.localize = (k) => k
  globalThis.game.i18n.format = (k) => k
  savedUser = game.user
  savedCombat = game.combat
  savedUsers = game.users
  game.user = {
    id: "gm", isGM: true
  }
  game.users = {
    activeGM: game.user
  }
  const common = {
    type: "actorPc", items: [], testUserPermission: () => false
  }
  base = {
    ...common, id: "base", isToken: false, system: withInit(10)
  }
  // Two unlinked tokens of the same actor, wounded differently (-1 and -2)
  synth1 = {
    ...common, id: "base", isToken: true, token: {
      id: "t1"
    }, system: withInit(9)
  }
  synth2 = {
    ...common, id: "base", isToken: true, token: {
      id: "t2"
    }, system: withInit(8)
  }
  linked = {
    ...common, id: "lnk", isToken: false, system: withInit(10)
  }
  c1 = fighter("c1", "t1", "base", synth1, false, 41, 9)
  c2 = fighter("c2", "t2", "base", synth2, false, 30, 8)
  c3 = fighter("c3", "t3", "lnk", linked, true, 20, 10)
  game.combat = {
    combatants: [c1, c2, c3]
  }
  actors = {
    base, t1: synth1, t2: synth2, lnk: linked
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(id => actors[id])
})

afterEach(() => {
  game.user = savedUser
  game.users = savedUsers
  game.combat = savedCombat
  vi.restoreAllMocks()
})

const update = (document) => sr5HookUpdateActor(document, {
  system: {
    conditionMonitors: {
    }
  }
}, {
}, "gm")

describe("wound modifier on the initiative of unlinked tokens", () => {
  it("an update of the base actor leaves the wounded tokens' initiative alone, update after update", async () => {
    await update(base)
    await update(base)
    await update(base)
    expect(c1.initiative).toBe(41)
    expect(c2.initiative).toBe(30)
    expect(c3.initiative).toBe(20)
  })

  it("a base change that reaches the tokens moves each one by its own change, once", async () => {
    // The base Reaction goes up by 1: both synthetic actors are prepared again from it
    base.system = withInit(11)
    synth1.system = withInit(10)
    synth2.system = withInit(9)
    await update(base)
    await update(base)
    expect(c1.initiative).toBe(42)
    expect(c2.initiative).toBe(31)
    expect(c3.initiative).toBe(20)
  })

  it("a base actor is compared again through each of its fighters, an unlinked token by its own id", () => {
    expect(SR5Combat.initTargetsOfActor(base)).toEqual(["t1", "t2"])
    expect(SR5Combat.initTargetsOfActor(synth1)).toEqual(["t1"])
    expect(SR5Combat.initTargetsOfActor(linked)).toEqual(["lnk"])
  })

  it("a new wound on one token moves that token only", async () => {
    synth2.system = withInit(7)
    await update(synth2)
    await update(synth2)
    expect(c2.initiative).toBe(29)
    expect(c1.initiative).toBe(41)
  })

  it("with two GMs connected, the wound is taken off once, by the active GM alone", async () => {
    linked.system = withInit(9)
    // The other GM's client sees the same update: it leaves the initiative to the active GM
    game.user = {
      id: "gm2", isGM: true
    }
    await update(linked)
    expect(c3.initiative).toBe(20)
    // The active GM's client takes the wound off
    game.user = game.users.activeGM
    await update(linked)
    expect(c3.initiative).toBe(19)
  })

  it("a linked actor's wound moves its own combatant", async () => {
    linked.system = withInit(9)
    await update(linked)
    await update(linked)
    expect(c3.initiative).toBe(19)
    expect(c1.initiative).toBe(41)
    expect(c2.initiative).toBe(30)
  })
})
