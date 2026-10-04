import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

// GM ruling (05/10): a slaved vehicle or drone is an icon that can be attacked, like any other device
describe('Choosing the device that defends in the Matrix', () => {
  const template = readFileSync(new URL('../templates/interface/itemMatrixTarget.hbs', import.meta.url), 'utf8')

  it('offers the connected vehicles and drones', () => {
    expect(template).toMatch(/\{\{#if list\.vehicles\}\}\s*<optgroup[^>]*>\s*\{\{selectOptions list\.vehicles/)
  })

  it('offers every kind of connected object the actor lists', () => {
    const source = readFileSync(new URL('../modules/datamodels/actors/partial/matrix.js', import.meta.url), 'utf8')
    const block = source.slice(source.indexOf('connectedObject:'), source.indexOf('}),', source.indexOf('connectedObject:')))
    const kinds = [...block.matchAll(/(\w+): new fields\.ObjectField/g)].map(m => m[1])
    expect(kinds).toContain('vehicles')
    for (const kind of kinds) expect(template).toContain(`list.${kind}`)
  })
})