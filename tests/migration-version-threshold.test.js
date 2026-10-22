import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'fs'
import path from 'path'

vi.hoisted(() => {
  globalThis.foundry.applications.hud = {
    TokenHUD: class {}
  }
})

vi.mock('../modules/interface/link-matches-tooltip.js', () => ({
  initLinkMatchesTooltip: () => {}
}))
vi.mock('../modules/interface/journal-heading-levels.js', () => ({
  sr5DeepenModuleTableOfContents: () => {}
}))

import {
  sr5RunMigrations
} from '../modules/hooks/ready.js'

// Relecture de la 1.0 (Gédéon#8350) : un monde venu de la 13.0.0-djamz.17 passe en 13.1.0 sans rejouer la migration
// de version (migrateWorld), et les migrations de fonction tournent quand même.

// The threshold as sr5HookReady writes it, read from the source: the test follows it if it moves
const READY = fs.readFileSync(path.resolve(__dirname, '../modules/hooks/ready.js'), 'utf8')
const NEEDS_MIGRATION_VERSION = READY.match(/const NEEDS_MIGRATION_VERSION = "([^"]+)"/)?.[1]

// Foundry V13's foundry.utils.isNewerVersion (common/utils/helpers.mjs): parts split on ".", numeric parts compared
// as numbers, the others as strings ("0-alpha" < "0-djamz"), a missing part of the older one makes the other newer
function isNewerVersion(v1, v0) {
  const numeric = n => n !== '' && !isNaN(parseFloat(n)) && isFinite(n)
  const v1Parts = String(v1).split('.')
  const v0Parts = String(v0).split('.')
  for (const [i, p1] of v1Parts.entries()) {
    const p0 = v0Parts[i]
    if (p0 === undefined) return true
    if (numeric(p0) && numeric(p1)) {
      if (Number(p1) !== Number(p0)) return Number(p1) > Number(p0)
    } else if (p1 !== p0) return p1 > p0
  }
  return false
}

// The decision of sr5HookReady (modules/hooks/ready.js) for a world that is not new
const needsMigration = version => !version || isNewerVersion(NEEDS_MIGRATION_VERSION, version)

describe('version migration threshold (NEEDS_MIGRATION_VERSION)', () => {
  it('is found in ready.js and is lower than the system version', () => {
    const system = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../system.json'), 'utf8'))
    expect(NEEDS_MIGRATION_VERSION).toBe('13.0.0-alpha.22')
    expect(isNewerVersion(system.version, NEEDS_MIGRATION_VERSION)).toBe(true)
  })

  it('a world from 13.0.0-djamz.17, or any djamz prerelease, does not replay migrateWorld in 13.1.0', () => {
    for (let n = 1; n <= 17; n++) expect(needsMigration(`13.0.0-djamz.${n}`)).toBe(false)
  })

  it('a world already recorded at 13.1.0 (new world of the 1.0, or migrated by it) is left alone', () => {
    expect(needsMigration('13.1.0')).toBe(false)
  })

  it('a world from alpha.22 or later is left alone; one from an earlier alpha migrates (numeric, not "3" > "22")', () => {
    for (const n of [22, 23, 30, 99]) expect(needsMigration(`13.0.0-alpha.${n}`)).toBe(false)
    for (const n of [1, 3, 9, 21]) expect(needsMigration(`13.0.0-alpha.${n}`)).toBe(true)
  })

  it('a V12 world, or one with documents but no record, migrates', () => {
    for (const v of ['12.0.1', '12.1.4', '11.3.0']) expect(needsMigration(v)).toBe(true)
    expect(needsMigration(null)).toBe(true)
  })

  it('a world recorded at a bare 13.0.0 (shadowfoundry upstream) migrates: "0-alpha" sorts after "0"', () => {
    expect(needsMigration('13.0.0')).toBe(true)
  })
})

describe('sr5RunMigrations', () => {
  let calls
  beforeEach(() => {
    calls = []
    const names = ['migrateWorld', 'migrateHeadcaseNanite', 'migrateFlashlightEffect', 'migrateContactCommcodes',
      'migrateMegapackLitePaths']
    globalThis.game.sr5 = {
      migration: class {
        constructor() {
          for (const name of names) this[name] = async () => {
            calls.push(name)
          }
        }
      }
    }
  })

  it('below the threshold: migrateWorld first, then every feature migration', async () => {
    await sr5RunMigrations(true)
    expect(calls).toEqual(['migrateWorld', 'migrateHeadcaseNanite', 'migrateFlashlightEffect', 'migrateContactCommcodes',
      'migrateMegapackLitePaths'])
  })

  it('a djamz.17 world: no migrateWorld, the feature migrations still run (the Lite images included)', async () => {
    await sr5RunMigrations(needsMigration('13.0.0-djamz.17'))
    expect(calls).not.toContain('migrateWorld')
    expect(calls).toEqual(['migrateHeadcaseNanite', 'migrateFlashlightEffect', 'migrateContactCommcodes',
      'migrateMegapackLitePaths'])
  })
})
