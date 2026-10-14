import {
  describe, it, expect
} from "vitest"
import {
  migrateLegacyImgPath, migrateLegacyImages, migrateLegacyDescription, migrateLocksmithLimit, isLegacySource
} from "../modules/datamodels/common/v12ImportMigration.js"

// Lot 44: an actor exported from V12 (system 12.0.5) and imported in V13 never goes through the world migration.
// Measured on Valentina "GhostFrame" Nuñez: description lost, 18 item icons broken, Locksmith on the mental limit.

const v12Actor = () => ({
  type: "actorPc",
  img: "systems/sr5/img/actors/actorPc.svg",
  prototypeToken: {
    texture: {
      src: "systems/sr5/img/actors/actorPc.svg"
    }
  },
  _stats: {
    coreVersion: "12.331", systemVersion: "12.0.5"
  },
  system: {
    characterDescription: "<p>Dans les néons violets de Metropol</p>",
    biography: {
      description: "", background: "<p>Passé</p>"
    },
    skills: {
      locksmith: {
        limit: {
          base: "mentalLimit"
        }
      }
    }
  }
})

const v13Actor = () => ({
  type: "actorPc",
  img: "systems/sr5/assets/img/actors/actorPc.svg",
  prototypeToken: {
    texture: {
      src: "worlds/w/token.webp"
    }
  },
  _stats: {
    coreVersion: "13.351", systemVersion: "13.0.0-alpha.25"
  },
  system: {
    biography: {
      description: "<p>Écrite en V13</p>"
    },
    skills: {
      locksmith: {
        limit: {
          base: "mentalLimit"
        }
      }
    }
  }
})

const migrateActor = source => {
  migrateLegacyImages(source)
  migrateLegacyDescription(source.system)
  migrateLocksmithLimit(source)
  return source
}

describe("image paths of V12", () => {
  it("moves img/ to assets/img/", () => {
    expect(migrateLegacyImgPath("systems/sr5/img/items/itemQuality.svg")).toBe("systems/sr5/assets/img/items/itemQuality.svg")
  })

  it("leaves every other path as is", () => {
    for (const path of ["systems/sr5/assets/img/items/itemGear.svg", "icons/svg/item-bag.svg", "https://a.b/systems/sr5/img/x.png", "", null, undefined]) {
      expect(migrateLegacyImgPath(path)).toBe(path)
    }
  })

  it("moves the image of an item and of an actor's prototype token", () => {
    const item = migrateLegacyImages({
      img: "systems/sr5/img/items/itemSin.svg"
    })
    expect(item.img).toBe("systems/sr5/assets/img/items/itemSin.svg")
    const actor = migrateLegacyImages(v12Actor())
    expect(actor.img).toBe("systems/sr5/assets/img/actors/actorPc.svg")
    expect(actor.prototypeToken.texture.src).toBe("systems/sr5/assets/img/actors/actorPc.svg")
  })
})

describe("description of V12", () => {
  it("takes characterDescription into an empty biography.description", () => {
    const system = migrateLegacyDescription(v12Actor().system)
    expect(system.biography.description).toBe("<p>Dans les néons violets de Metropol</p>")
    expect(system.biography.background).toBe("<p>Passé</p>")
    expect("characterDescription" in system).toBe(false)
  })

  it("never writes over a description already there", () => {
    const system = v12Actor().system
    system.biography.description = "<p>Déjà là</p>"
    expect(migrateLegacyDescription(system).biography.description).toBe("<p>Déjà là</p>")
  })

  it("creates the biography when the source has none", () => {
    expect(migrateLegacyDescription({
      characterDescription: "<p>x</p>"
    }).biography.description).toBe("<p>x</p>")
  })

  it("drops an empty characterDescription without touching the biography", () => {
    const system = migrateLegacyDescription({
      characterDescription: "", biography: {
        description: ""
      }
    })
    expect(system.biography.description).toBe("")
    expect("characterDescription" in system).toBe(false)
  })
})

describe("limit of Locksmith", () => {
  it("puts a V12 actor on the physical limit", () => {
    expect(migrateLocksmithLimit(v12Actor()).system.skills.locksmith.limit.base).toBe("physicalLimit")
  })

  it("leaves a value written in V13 as it is", () => {
    expect(migrateLocksmithLimit(v13Actor()).system.skills.locksmith.limit.base).toBe("mentalLimit")
  })

  it("leaves a document with no version as it is", () => {
    const source = v12Actor()
    delete source._stats
    expect(migrateLocksmithLimit(source).system.skills.locksmith.limit.base).toBe("mentalLimit")
    expect(isLegacySource({
      _stats: {
        systemVersion: null
      }
    })).toBe(false)
  })
})

describe("replayed migration", () => {
  it("leaves a V13 actor identical", () => {
    const source = v13Actor()
    expect(migrateActor(v13Actor())).toEqual(source)
  })

  it("is idempotent on a V12 actor", () => {
    const once = migrateActor(v12Actor())
    const twice = migrateActor(structuredClone(once))
    expect(twice).toEqual(once)
  })
})
