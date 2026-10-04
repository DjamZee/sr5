import {
  describe, it, expect, vi
} from 'vitest'
import {
  execFileSync
} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  SR5_SystemHelpers
} = await import('../modules/system/utilitySystem.js')

describe('Partials must be preloaded (N88)', () => {
  it('rejects a template whose partial is not in modules/templates.js', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr5-partial-'))
    const file = path.join(dir, 'probe.hbs')
    fs.writeFileSync(file, '{{> systems/sr5/templates/items/_partial/editable/_common/nowhere-edit.hbs}}\n')
    let failed = false
    try {
      execFileSync('node', ['scripts/validate-templates.js', file], {
        stdio: 'pipe'
      })
    } catch (err) {
      failed = true
      expect(String(err.stderr)).toContain('nowhere-edit.hbs is not preloaded')
    }
    fs.rmSync(dir, {
      recursive: true
    })
    expect(failed).toBe(true)
  })

  it('accepts the credstick partial, which is preloaded', () => {
    expect(() => execFileSync('node', ['scripts/validate-templates.js', 'templates/items/blocks/gear/gear-stat.hbs'], {
      stdio: 'pipe'
    })).not.toThrow()
  })
})

describe('An item sheet that fails to render says so', () => {
  it('notifies the user instead of failing silently', async () => {
    const error = vi.fn()
    globalThis.ui = {
      notifications: {
        error
      }
    }
    globalThis.game = {
      i18n: {
        format: k => k
      }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await SR5_SystemHelpers.renderSheetLoudly({
      name: 'Credstick', sheet: {
        render: async () => {
          throw new Error('partial missing')
        }
      }
    }, {
      force: true
    })
    expect(error).toHaveBeenCalledWith('SR5.WARN_SheetRenderFailed')
  })
})
