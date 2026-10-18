// Nettoyage N2: the local lists of an actor's player owners against playerOwners of card-helpers.js. Each local copy
// is kept here word for word, as it stood in local/storage be5a10e56, and run on the same actors as the shared one,
// with Document#testUserPermission as Foundry 13.351 reads ownership (the user's level, else the default one).
// Neither is equal, so both stay in their files, and this test keeps them there.
import {
  describe, it, expect, beforeAll, afterAll
} from "vitest"
import {
  readFileSync
} from "node:fs"

const {
  playerOwners: shared
} = await import("../modules/system/card-helpers.js")

const LEVELS = {
  NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3
}

const user = (id, isGM, active = true) => ({
  id, isGM, active
})
const USERS = [user("gm", true), user("p1", false), user("p2", false), user("away", false, false)]

function actor(ownership){
  return {
    ownership,
    testUserPermission(u, level){
      if (u.isGM) return true
      return (ownership[u.id] ?? ownership.default ?? LEVELS.NONE) >= LEVELS[level]
    }
  }
}

const ACTORS = {
  "no actor (null)": null,
  "no actor (undefined)": undefined,
  "owned by nobody": actor({
    default: LEVELS.NONE
  }),
  "owned by one player": actor({
    p1: LEVELS.OWNER
  }),
  "owned by two players": actor({
    p1: LEVELS.OWNER, p2: LEVELS.OWNER
  }),
  "seen, not owned, by a player": actor({
    p1: LEVELS.OBSERVER
  }),
  "owned by the gamemaster": actor({
    gm: LEVELS.OWNER
  }),
  "owned by a player away": actor({
    away: LEVELS.OWNER
  }),
  "owned by everyone by default": actor({
    default: LEVELS.OWNER
  })
}

const COPIES = [
  {
    file: "modules/system/deadlines.js", name: "playerOwners",
    code: `function playerOwners(actor){
  return game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id)
}`,
    differs: ["no actor (null)", "no actor (undefined)"]
  },
  // Not a copy of playerOwners: the first active player who owns the actor by name, for getUserOwner
  {
    file: "modules/entities/helpers.js", name: "listOf",
    code: "const playerOwners = Object.entries(actor.ownership).filter(([id, level]) => (!game.users.get(id)?.isGM && game.users.get(id)?.active) && level === 3).map(([id, _level])=> id)",
    wrap: code => `function listOf(actor){\n${code}\nreturn playerOwners\n}`,
    differs: ["no actor (null)", "no actor (undefined)", "owned by a player away", "owned by everyone by default"]
  }
]

const squash = text => text.replace(/\s+/g, " ").trim()
const outcome = (fn, input) => {
  try {
    return {
      value: JSON.stringify(fn(input))
    }
  } catch (e) {
    return {
      threw: e.constructor.name
    }
  }
}
const differences = fn => Object.entries(ACTORS).filter(([, input]) => {
  const mine = outcome(fn, input), theirs = outcome(shared, input)
  return mine.value !== theirs.value || mine.threw !== theirs.threw
}).map(([name]) => name)

describe("Nettoyage N2: the local lists of player owners", () => {
  let saved
  beforeAll(() => {
    saved = globalThis.game
    const users = [...USERS]
    users.get = id => USERS.find(u => u.id === id)
    globalThis.game = {
      users
    }
  })
  afterAll(() => {
    globalThis.game = saved
  })

  it("shared playerOwners lists the players who own the actor, active or not, and nothing for no actor", () => {
    expect(shared(ACTORS["owned by two players"])).toEqual(["p1", "p2"])
    expect(shared(ACTORS["owned by everyone by default"])).toEqual(["p1", "p2", "away"])
    expect(shared(null)).toEqual([])
  })

  for (const copy of COPIES){
    const local = new Function(`${copy.wrap ? copy.wrap(copy.code) : copy.code}\nreturn ${copy.name}`)()
    it(`${copy.file}: different on ${copy.differs.join(", ")}`, () => {
      expect(differences(local)).toEqual(copy.differs)
    })
    it(`${copy.file}: keeps its own list`, () => {
      expect(squash(readFileSync(copy.file, "utf8"))).toContain(squash(copy.code))
    })
  }
})
