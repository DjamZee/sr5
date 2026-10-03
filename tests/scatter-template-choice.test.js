import {
  describe, it, expect, afterEach
} from "vitest"
import {
  SR5_SystemHelpers
} from "../modules/system/utilitySystem.js"

// A grenade thrown twice without removing the first circle leaves two templates flagged with the same item.
// Scatter and blast used to take the first one found, so the second shot moved and measured the first circle.

function template(id, item, createdTime, x = 0){
  return {
    id, x, y: 0, flags: {
      sr5: {
        item
      }
    }, _stats: {
      createdTime
    }
  }
}

function sceneWith(list){
  const templates = [...list]
  templates.get = (id) => list.find(t => t.id === id)
  globalThis.canvas = {
    scene: {
      templates, grid: {
        size: 100
      }
    }
  }
}

afterEach(() => {
  delete globalThis.canvas
})

describe("SR5_SystemHelpers.findItemTemplate", () => {
  it("takes the shot's own template when the card knows it, even if a newer one exists", () => {
    sceneWith([template("old", "grenade", 1), template("new", "grenade", 2)])
    expect(SR5_SystemHelpers.findItemTemplate("grenade", "old").id).toBe("old")
  })

  it("otherwise takes the most recently created template of the item, not the first", () => {
    sceneWith([template("old", "grenade", 1), template("new", "grenade", 2), template("other", "spell", 3)])
    expect(SR5_SystemHelpers.findItemTemplate("grenade").id).toBe("new")
    expect(SR5_SystemHelpers.findItemTemplate("grenade", "gone").id).toBe("new")
  })

  it("finds nothing when the item left no template", () => {
    sceneWith([template("other", "spell", 3)])
    expect(SR5_SystemHelpers.findItemTemplate("grenade")).toBeUndefined()
  })

  it("measures the blast from the shot's own template", async () => {
    sceneWith([template("old", "grenade", 1, 1000), template("new", "grenade", 2, 2000)])
    expect((await SR5_SystemHelpers.getTemplateItemPosition("grenade", "old")).x).toBe(950)
    expect((await SR5_SystemHelpers.getTemplateItemPosition("grenade")).x).toBe(1950)
  })
})
