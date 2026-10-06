import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

const {
  legacyBiographyUpdate, legacyDeltaUpdate, migrateLegacyBiography, runLegacyBiographyMigration, LEGACY_BIOGRAPHY_MIGRATION
} = await import("../modules/migration-legacy-biography.js")

// Bérénice's review: migrateData read characterGender into gender in memory only. The database kept the old key, and a
// gender emptied on the sheet showed "female" again at the next load. Once per world, the keys are unset.

const actor = (type, biography, extra = {
}) => ({
  type, name: type, _source: {
    system: {
      biography
    }
  }, update: vi.fn(async () => {}), ...extra
})

let saved, setting
beforeEach(() => {
  saved = {
    user: game.user, users: game.users, actors: game.actors, scenes: game.scenes, packs: game.packs, settings: game.settings
  }
  setting = 0
  game.user = {
    id: "gm", isGM: true
  }
  game.users = {
    activeGM: game.user
  }
  game.scenes = []
  game.packs = []
  game.settings = {
    get: () => setting, set: vi.fn(async (_s, _k, v) => {
      setting = v
    })
  }
})
afterEach(() => {
  Object.assign(game, saved)
})

describe("the update of one biography", () => {
  // An unset ("-=") of a key the data model does not know is dropped by the client's cleaning (measured in game)
  it("an actor's: the biography as read, written whole by a forced replacement, without the legacy keys", () => {
    expect(legacyBiographyUpdate({
      gender: "female", age: "", characterGender: "", description: "x"
    })).toEqual({
      "system.==biography": {
        gender: "female", age: "", description: "x"
      }
    })
  })

  it("an unlinked token's: the legacy keys unset in its delta, only the current keys it holds written", () => {
    const update = legacyDeltaUpdate({
      gender: "male"
    })
    expect(Object.keys(update).filter(k => !k.includes("-="))).toEqual(["delta.system.biography.gender"])
    expect(update["delta.system.biography.-=characterGender"]).toBeNull()
    expect(update["delta.system.biography.-=characterSkin"]).toBeNull()
  })
})

describe("the migration of a world", () => {
  it("writes every PC and grunt, diff off, and leaves the other actors", async () => {
    const pc = actor("actorPc", {
        gender: "female"
      }), grunt = actor("actorGrunt", {
        gender: ""
      }), drone = actor("actorDrone", {
      })
    game.actors = [pc, grunt, drone]
    expect(await migrateLegacyBiography()).toEqual({
      actors: 2, tokens: 0, packed: 0, failed: 0
    })
    expect(pc.update.mock.calls[0][0]["system.==biography"]).toEqual({
      gender: "female"
    })
    expect(pc.update.mock.calls[0][1]).toMatchObject({
      diff: false
    })
    expect(drone.update).not.toHaveBeenCalled()
  })

  it("an unlinked token with a biography in its delta, written on the token; a linked one is the actor", async () => {
    const synthetic = actor("actorPc", {
    })
    const token = {
      actorLink: false, actor: synthetic, update: vi.fn(async () => {}), delta: {
        _source: {
          system: {
            biography: {
              gender: "male"
            }
          }
        }
      }
    }
    game.actors = []
    game.scenes = [{
      name: "s", tokens: [token, {
        actorLink: true, actor: actor("actorPc", {
        }), delta: null
      }, {
        actorLink: false, actor: actor("actorPc", {
        }), delta: {
          _source: {
            system: {
            }
          }
        }
      }]
    }]
    expect((await migrateLegacyBiography()).tokens).toBe(1)
    expect(token.update.mock.calls[0][0]["delta.system.biography.gender"]).toBe("male")
    expect(token.update.mock.calls[0][1]).toMatchObject({
      diff: false
    })
    expect(synthetic.update).not.toHaveBeenCalled()
  })

  it("is marked done once nothing failed, and runs once, by the active GM alone", async () => {
    game.actors = [actor("actorPc", {
    })]
    await runLegacyBiographyMigration()
    expect(setting).toBe(LEGACY_BIOGRAPHY_MIGRATION)
    const pc = actor("actorPc", {
    })
    game.actors = [pc]
    await runLegacyBiographyMigration()
    expect(pc.update).not.toHaveBeenCalled()
    setting = 0
    game.users.activeGM = {
      id: "other"
    }
    await runLegacyBiographyMigration()
    expect(pc.update).not.toHaveBeenCalled()
  })

  it("a failure leaves it to run again at the next load", async () => {
    game.actors = [actor("actorPc", {
    }, {
      update: vi.fn(async () => {
        throw new Error("x")
      })
    })]
    vi.spyOn(console, "error").mockImplementation(() => {})
    await runLegacyBiographyMigration()
    expect(setting).toBe(0)
  })
})
