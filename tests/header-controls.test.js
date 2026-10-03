import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

// The V13 header no longer includes the per-type header/nav partials: each type's
// header fields come back through a header/controls partial included by type
const HEADER = 'templates/actors/_partials/header/header.hbs'
const FIELDS = {
  actorSpirit: ['system.force.base', 'system.isBounded'],
  actorSprite: ['system.level', 'system.isRegistered'],
  actorAgent: ['system.rating'],
  actorDevice: ['system.matrix.deviceType'],
  actorDrone: ['system.type'],
}

describe('actor sheet header controls', () => {
  const header = fs.readFileSync(HEADER, 'utf8')
  const preload = fs.readFileSync('modules/templates.js', 'utf8')

  for (const [type, names] of Object.entries(FIELDS)) {
    const control = `templates/actors/_partials/header/controls/${type}.hbs`
    const path = `systems/sr5/${control}`

    it(`includes and preloads the ${type} controls`, () => {
      const block = header.match(new RegExp(`\\{\\{#if \\(eq actor\\.type "${type}"\\)\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`))
      expect(block).not.toBeNull()
      expect(block[1]).toContain(path)
      expect(preload).toContain(`"${path}"`)
    })

    it(`binds the ${type} fields`, () => {
      const html = fs.readFileSync(control, 'utf8')
      for (const name of names) expect(html).toContain(`name="${name}"`)
    })
  }

  it('binds the agent rating to the field the data model keeps', () => {
    const html = fs.readFileSync('templates/actors/_partials/header/controls/actorAgent.hbs', 'utf8')
    expect(html).toContain('value="{{system.rating}}"')
    expect(html).not.toContain('name="system.level"')
  })
})
