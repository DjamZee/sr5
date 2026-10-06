import {
  describe, it, expect, vi
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import Migration from "../modules/migration.js"

// The compendiums of sr5-compendiums and of the Megapack are kept up to date at their source: a system
// migration must not unlock and rewrite them in each world (Megapack: arbitrage de DjamZ, séance H, H19).

const pack = packageName => ({
  metadata: {
    packageName
  }
})

describe("compendiums left alone by the system migration", () => {
  it("sr5-compendiums and the Megapack are not migrated", () => {
    expect(Migration.isMaintainedAtSource(pack("sr5-compendiums"))).toBe(true)
    expect(Migration.isMaintainedAtSource(pack("megapack-sr5-foundry-vtt"))).toBe(true)
  })

  it("a world compendium or another module's is migrated", () => {
    expect(Migration.isMaintainedAtSource(pack("world"))).toBe(false)
    expect(Migration.isMaintainedAtSource(pack("bibliotheque-sr5-foundry"))).toBe(false)
    expect(Migration.isMaintainedAtSource(undefined)).toBe(false)
  })
})
