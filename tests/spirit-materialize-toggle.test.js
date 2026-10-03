import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

// The V13 header no longer includes the per-type header/nav partials, which held the
// spirit's materialization switch: it must be reached from the header itself
const HEADER = 'templates/actors/_partials/header/header.hbs'
const CONTROL = 'templates/actors/_partials/header/controls/actorSpirit.hbs'
const CONTROL_PATH = `systems/sr5/${CONTROL}`

describe('spirit materialization switch', () => {
  it('is included in the actor sheet header, for spirits only', () => {
    const header = fs.readFileSync(HEADER, 'utf8')
    const block = header.match(/\{\{#if \(eq actor\.type "actorSpirit"\)\}\}([\s\S]*?)\{\{\/if\}\}/)
    expect(block).not.toBeNull()
    expect(block[1]).toContain(CONTROL_PATH)
  })

  it('is preloaded with the other templates', () => {
    expect(fs.readFileSync('modules/templates.js', 'utf8')).toContain(`"${CONTROL_PATH}"`)
  })

  it('hands the wanted initiative to the init-switch handler', () => {
    const control = fs.readFileSync(CONTROL, 'utf8')
    const input = control.match(/<input[^>]*id="materializeIcon"[^>]*>/)[0]
    // _onInitiativeSwitch recognizes the materialization by this id, and reads the wanted initiative from data-binding
    expect(input).toContain('class="init-switch"')
    expect(input).toContain('id="materializeIcon"')
    expect(input).toContain('data-binding="{{#if system.isMaterializing}}astralInit{{else}}physicalInit{{/if}}"')
    expect(input).toContain('name="system.isMaterializing"')
  })
})
