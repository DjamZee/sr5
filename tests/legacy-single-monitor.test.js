import {
  describe, it, expect, vi
} from "vitest"

// A watcher summoned before conditionMonitors.condition existed kept its damage in Physical
// (and Stun). The spirit data model reads it into the single condition monitor (SR5 p. 301).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  class Field {
    constructor(options) {
      this.options = options
    }
  }
  globalThis.foundry ??= {
  }
  globalThis.foundry.data = {
    fields: new Proxy({
    }, {
      get: () => Field
    })
  }
})

import {
  migrateLegacySingleMonitor
} from "../modules/datamodels/actors/actorSpirit.js"

function legacySource(type, physical, stun = physical) {
  return {
    type,
    attributes: {
    },
    skills: {
    },
    conditionMonitors: {
      physical: {
        actual: {
          base: physical
        }
      },
      stun: {
        actual: {
          base: stun
        }
      },
    }
  }
}

describe("watchers stored before the single condition monitor", () => {
  it("read their old damage into the condition monitor", () => {
    const source = migrateLegacySingleMonitor(legacySource("watcher", 4, 2))
    expect(source.conditionMonitors.condition.actual.base).toBe(4)
  })

  it("leave a condition monitor that was already written alone, even healed to 0", () => {
    const source = legacySource("watcher", 4)
    source.conditionMonitors.condition = {
      actual: {
        base: 0
      }
    }
    expect(migrateLegacySingleMonitor(source).conditionMonitors.condition.actual.base).toBe(0)
  })

  it("read a custom type based on watcher before the registry is built (ready)", () => {
    // The registry of custom spirit types is empty while documents are constructed
    const source = migrateLegacySingleMonitor(legacySource("myCustomWatcherId", 5))
    expect(source.conditionMonitors.condition.actual.base).toBe(5)
  })

  it("leave update diffs alone: a partial conditionMonitors is not a stored spirit", () => {
    const diff = {
      type: "watcher", conditionMonitors: {
        physical: {
          actual: {
            base: 6
          }
        }
      }
    }
    expect(migrateLegacySingleMonitor(diff).conditionMonitors.condition).toBeUndefined()
  })

  it("leave a diff carrying both monitors alone, without the rest of the spirit", () => {
    const diff = legacySource("watcher", 6)
    delete diff.attributes
    delete diff.skills
    expect(migrateLegacySingleMonitor(diff).conditionMonitors.condition).toBeUndefined()
  })
  it("add nothing to an unharmed watcher", () => {
    const source = migrateLegacySingleMonitor(legacySource("homunculus", 0))
    expect(source.conditionMonitors.condition).toBeUndefined()
  })
})
