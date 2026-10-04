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

  // N74: a vehicle with its wireless off is no icon in the Matrix; slaved or not, a wireless one is (SR5 p. 270)
  it('lists the vehicles with their wireless on, whether slaved or not', () => {
    const source = readFileSync(new URL('../modules/entities/actors/entityActor.js', import.meta.url), 'utf8')
    const start = source.indexOf('case "itemVehicle":')
    const block = source.slice(start, source.indexOf('break', start))
    const line = block.split('\n').find(l => l.includes('connectedObject.vehicles'))
    // N91: the switch is read through the deployed drone, which holds it
    expect(line).toMatch(/^\s*if \(SR5_ActorHelper\.vehicleWirelessOn\(i, game\.actors\)\) actor\.system\.matrix\.connectedObject\.vehicles/)
    expect(line).not.toMatch(/isSlavedToPan/)
  })
})