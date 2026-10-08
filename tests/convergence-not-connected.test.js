import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'
import {
  isConnectedPersona, markable
} from '../modules/system/matrix-api.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// Arbitrage de DjamZ du 08/10: a persona with no active device does not undergo the convergence (Anatolie)
describe('a persona with no active device is out of the convergence\'s reach', () => {
  const device = isActive => ({
    type: 'itemDevice', system: {
      isActive
    }
  })

  it('connected: an active device, or an AI', () => {
    expect(isConnectedPersona({
      items: [device(true)], system: {
      }
    })).toBe(true)
    expect(isConnectedPersona({
      items: [device(false)], system: {
        activeSpecialAttribute: 'depth'
      }
    })).toBe(true)
    expect(isConnectedPersona({
      items: [device(false)], system: {
      }
    })).toBe(false)
    expect(isConnectedPersona(null)).toBe(false)
  })

  it('markable reads "connected" the same way', () => {
    expect(markable({
      actor: {
        items: [device(false)], system: {
        }
      }
    })).toBe(false)
    expect(markable({
      actor: {
        items: [device(true)], system: {
        }
      }
    })).toBe(true)
  })

  it('the GM\'s convergence stops before any damage or reboot, and says why in both languages', () => {
    const source = read('../modules/system/matrix-api.js')
    const body = source.slice(source.indexOf('async function gmConverge('))
    const guard = body.indexOf('if (!isConnectedPersona(actor))')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(body.indexOf('postConvergenceCard(actor'))
    expect(guard).toBeLessThan(body.indexOf('rebootDeck()'))
    for (const lang of ['fr', 'en']) expect(JSON.parse(read(`../lang/${lang}.json`))['SR5.MatrixConvergenceNotConnected']).toContain('{name}')
  })

  it('the reboot notification names the persona when its device was just turned off', () => {
    expect(read('../modules/entities/actors/entityActor.js')).toContain('${this.system.matrix.deviceName || SR5_EntityHelpers.displayName(this)} ${game.i18n.localize("SR5.Rebooted")}')
  })
})
