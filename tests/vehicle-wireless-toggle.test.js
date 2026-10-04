import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

// A vehicle has a wireless switch (system.wirelessTurnedOn) and leaves the matrix defense list when it is off,
// so its row must carry the same toggle as the other devices: _onEditItemValue then charges the action
// (free through a DNI, SR5 p. 165, simple otherwise, p. 167)
const VEHICLES = 'templates/actors/_partials/right-tabs/gear/vehicles.hbs'

describe('vehicle wireless toggle', () => {
  const template = fs.readFileSync(VEHICLES, 'utf8')
  const row = template.match(/\{\{#each actor\.vehicles as \|item i\|\}\}([\s\S]*?)\{\{\/each\}\}/)[1]

  it('sits in the vehicle row, inside the .item element the handler looks for', () => {
    expect(row).toMatch(/<li class="item[^"]*" data-item-id="\{\{item\._id\}\}"/)
    const toggles = row.match(/<a class="toggle-value"[^>]*data-binding="system\.wirelessTurnedOn"[^>]*>/g)
    expect(toggles).toHaveLength(2)
  })

  it('looks like the other devices toggles', () => {
    expect(row).toContain('{{#if system.wirelessTurnedOn}}')
    expect(row).toContain("{{localize 'SR5.DisableWirelessMode'}}\"><em class=\"fas fa-sm fa-wifi SR-SubColor\"></em>")
    expect(row).toContain("{{localize 'SR5.EnableWirelessMode'}}\"><em class=\"fas fa-sm fa-wifi\"></em>")
    expect(row).toContain("SR5.HELP_WifiToggle")
  })

  // SR5 p. 228: a device whose matrix monitor is full is bricked; the row shows it as the armors do
  it('shows a bricked vehicle with a warning triangle instead of the toggle', () => {
    const bricked = row.match(/\{\{#if \(gte system\.conditionMonitors\.matrix\.actual\.value system\.conditionMonitors\.matrix\.value\)\}\}([\s\S]*?)\{\{else\}\}/)
    expect(bricked).not.toBeNull()
    expect(bricked[1]).toContain('fa-exclamation-triangle')
    expect(bricked[1]).toContain('SR5.HELP_BrickedItem')
    expect(bricked[1]).not.toContain('toggle-value')
  })
})
