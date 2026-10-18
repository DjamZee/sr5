// Nettoyage N2: the local copies of `isActiveGM` against the shared one of card-helpers.js. Each local copy is kept
// here word for word, as it stood in local/storage be5a10e56, and run in the same worlds as the shared one: users built
// as Foundry 13.351 builds them (User#isSelf, User#isActiveGM, Users#activeGM by role then id), from a world not yet
// set up (no game.user, as during init) to two active gamemasters. A copy equal in every world is replaced by the
// import; a copy that differs stays in its file, and this test keeps it there.
import {
  describe, it, expect, afterEach
} from "vitest"
import {
  readFileSync
} from "node:fs"

const {
  isActiveGM: shared
} = await import("../modules/system/card-helpers.js")

const ROLES = {
  PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4
}

// A User as Foundry 13.351 shows it (client/documents/user.mjs, common/documents/user.mjs)
function user(id, role, active = true){
  return {
    id, role, active,
    get isGM(){
      return this.role >= ROLES.ASSISTANT
    },
    get isSelf(){
      return game.userId === this.id
    },
    get isActiveGM(){
      return this === game.users.activeGM
    }
  }
}

// The Users collection: activeGM is the designated active gamemaster, highest role first, then the lowest id
function users(list){
  const all = [...list]
  all.get = id => list.find(u => u.id === id)
  Object.defineProperty(all, "activeGM", {
    get(){
      const qualifying = list.filter(u => u.active && u.isGM)
      if (!qualifying.length) return null
      return qualifying.reduce((designated, candidate) =>
        ((candidate.role - designated.role) || designated.id.localeCompare(candidate.id)) > 0 ? candidate : designated)
    }
  })
  return all
}

function world(selfId, list){
  const all = users(list)
  return {
    userId: selfId, users: all, user: all.get(selfId)
  }
}

const WORLDS = {
  "not set up (init)": () => ({
    userId: "a"
  }),
  "users, no user yet": () => ({
    userId: "a", users: users([user("a", ROLES.GAMEMASTER)])
  }),
  "a player, no gamemaster": () => world("a", [user("a", ROLES.PLAYER)]),
  "a player, a gamemaster on line": () => world("a", [user("a", ROLES.PLAYER), user("g", ROLES.GAMEMASTER)]),
  "a player, a gamemaster away": () => world("a", [user("a", ROLES.PLAYER), user("g", ROLES.GAMEMASTER, false)]),
  "the gamemaster alone": () => world("a", [user("a", ROLES.GAMEMASTER)]),
  "a gamemaster, the other away": () => world("b", [user("a", ROLES.GAMEMASTER, false), user("b", ROLES.GAMEMASTER)]),
  "two gamemasters, self designated": () => world("a", [user("a", ROLES.GAMEMASTER), user("b", ROLES.GAMEMASTER)]),
  "two gamemasters, the other designated": () => world("b", [user("a", ROLES.GAMEMASTER), user("b", ROLES.GAMEMASTER)]),
  "an assistant under a gamemaster": () => world("a", [user("a", ROLES.ASSISTANT), user("b", ROLES.GAMEMASTER)]),
  "a gamemaster over an assistant": () => world("b", [user("a", ROLES.ASSISTANT), user("b", ROLES.GAMEMASTER)])
}

const COPIES = [
  ...["modules/interface/commcode-request.js", "modules/system/combat-maneuvers.js", "modules/system/explosive-charge.js"]
    .map(file => ({
      file, replaced: true,
      code: "const isActiveGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id"
    })),
  {
    file: "modules/system/effectArea.js", replaced: false, equal: false,
    code: `function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}`
  },
  {
    file: "modules/system/rigger-ejection.js", replaced: false, equal: false,
    code: `function isActiveGM() {
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}`
  },
  {
    file: "modules/entities/actors/living-persona-hooks.js", replaced: false, equal: false,
    code: `function isActiveGM(){
  return !!game.users?.activeGM?.isSelf
}`
  },
  {
    file: "modules/system/chase.js", replaced: false, equal: false,
    code: "const isActiveGM = () => !!game.user?.isActiveGM"
  },
  // The code against cheating (guards, the gamemaster's registers and ledgers), which the cleaning plan leaves alone
  // (point 8): measured, not touched
  {
    file: "modules/system/overwatch-guard.js", replaced: false, equal: false, untouched: true,
    code: `function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}`
  },
  {
    file: "modules/system/spirit-ledger.js", replaced: false, equal: false, untouched: true,
    code: `export function isActiveGM(){
  return !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
}`
  },
  {
    file: "modules/system/aegis.js", replaced: false, equal: false, untouched: true,
    code: `export function isActiveGM(user = game.user){
  return !!user?.isGM && (game.users?.activeGM ?? null)?.id === user.id
}`
  },
  ...["bone-augmentation-guard", "implant-register", "preparation-register"].map(name => ({
    file: `modules/system/${name}.js`, replaced: false, equal: false, untouched: true,
    code: "const isActiveGM = () => !!game.users?.activeGM?.isSelf"
  }))
]

const squash = text => text.replace(/\s+/g, " ").trim()
const outcome = fn => {
  try {
    return {
      value: fn()
    }
  } catch (e) {
    return {
      threw: e.constructor.name
    }
  }
}
const differences = fn => Object.entries(WORLDS).filter(([, make]) => {
  globalThis.game = make()
  const mine = outcome(fn), theirs = outcome(shared)
  return !Object.is(mine.value, theirs.value) || mine.threw !== theirs.threw
}).map(([name]) => name)

describe("Nettoyage N2: the local copies of isActiveGM", () => {
  const saved = globalThis.game
  afterEach(() => {
    globalThis.game = saved
  })

  it("shared isActiveGM is true for the designated active gamemaster alone", () => {
    const answers = Object.fromEntries(Object.entries(WORLDS).slice(2).map(([name, make]) => {
      globalThis.game = make()
      return [name, shared()]
    }))
    expect(Object.keys(answers).filter(name => answers[name])).toEqual([
      "the gamemaster alone", "a gamemaster, the other away", "two gamemasters, self designated",
      "a gamemaster over an assistant"
    ])
  })

  for (const copy of COPIES){
    const local = new Function(`${copy.code.replace(/^export /, "")}\nreturn isActiveGM`)()
    const equal = copy.replaced || copy.equal
    it(`${copy.file}: ${equal ? "equal in every world" : "different before the world is set up"}`, () => {
      const found = differences(local)
      if (equal) expect(found).toEqual([])
      else expect(found).toEqual(["not set up (init)", "users, no user yet"])
    })
    it(`${copy.file}: ${copy.replaced ? "imports the shared isActiveGM" : "keeps its own isActiveGM"}`, () => {
      const source = readFileSync(copy.file, "utf8")
      if (copy.replaced){
        expect(squash(source)).not.toContain(squash(copy.code))
        expect(source).toMatch(/import \{[^}]*\bisActiveGM\b[^}]*\} from "[./]*(system\/)?card-helpers\.js"/)
      } else expect(squash(source)).toContain(squash(copy.code))
    })
  }
})
