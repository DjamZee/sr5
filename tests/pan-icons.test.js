import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PAN_ICON_CATEGORIES, iconCategoryOf, iconPathOf, customIconOf, nodeIconPathOf, isTintedIcon
} from '../modules/canvas/pan-crown/pan-icons.js'
import {
  buildPanGraph
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  layoutCrown, crownAngle, dashesOf, PAN_LAYOUT
} from '../modules/canvas/pan-crown/pan-layout.js'

// The drawing of the crown of a PAN (couronne du PAN, lot 2): which generic icon each item takes, and where the
// constellation B puts the icons (master linked to the token, slaves to the master).

const item = (type, system = {
}) => ({
  type, system
})

describe('pan icons: category of an item', () => {
  it('tells the commlink, the deck and the rigger console apart', () => {
    expect(iconCategoryOf(item('itemDevice', {
      type: 'commlink'
    }))).toBe('commlink')
    expect(iconCategoryOf(item('itemDevice', {
      type: 'cyberdeck'
    }))).toBe('cyberdeck')
    expect(iconCategoryOf(item('itemDevice', {
      type: 'riggerCommandConsole'
    }))).toBe('rigger-console')
    expect(iconCategoryOf(item('itemDevice', {
      type: 'livingPersona'
    }))).toBe('persona')
    expect(iconCategoryOf(item('itemDevice', {
      type: 'other'
    }))).toBe('device')
  })

  it('gives weapons, armors, drones and vehicles their own icon', () => {
    expect(iconCategoryOf(item('itemWeapon'))).toBe('weapon')
    expect(iconCategoryOf(item('itemArmor'))).toBe('armor')
    expect(iconCategoryOf(item('itemVehicle', {
      type: 'drone'
    }))).toBe('drone')
    expect(iconCategoryOf(item('itemVehicle', {
      type: 'vehicle'
    }))).toBe('vehicle')
  })

  it('sorts implants: eyes, ears, reflexes, the rest', () => {
    expect(iconCategoryOf(item('itemAugmentation', {
      category: 'eyeware'
    }))).toBe('implant-eye')
    expect(iconCategoryOf(item('itemAugmentation', {
      category: 'earware'
    }))).toBe('implant-ear')
    expect(iconCategoryOf(item('itemAugmentation', {
      category: 'bodyware', customEffects: [{
        target: 'system.initiatives.physicalInit.dice', value: 2
      }]
    }))).toBe('implant-reflex')
    expect(iconCategoryOf(item('itemAugmentation', {
      category: 'headware', customEffects: [{
        target: 'system.attributes.logic.augmented', value: 1
      }]
    }))).toBe('implant-other')
  })

  it('falls back on the generic device', () => {
    expect(iconCategoryOf(item('itemGear'))).toBe('device')
    expect(iconCategoryOf(null)).toBe('device')
  })
})

describe('pan icons: images', () => {
  it('has an image in the system for each of the 27 categories', () => {
    expect(PAN_ICON_CATEGORIES).toHaveLength(27)
    for (const category of PAN_ICON_CATEGORIES){
      const file = iconPathOf(category).replace('systems/sr5/', '')
      expect(fs.existsSync(path.resolve(__dirname, '..', file)), file).toBe(true)
    }
  })

  it('lets a table take the place of a generic image, and falls back on the device', () => {
    expect(iconPathOf('weapon', {
      weapon: 'worlds/x/gun.webp'
    })).toBe('worlds/x/gun.webp')
    expect(iconPathOf('armor', {
      weapon: 'worlds/x/gun.webp'
    })).toBe('systems/sr5/assets/img/pan/armor.webp')
    expect(iconPathOf('nothing')).toBe('systems/sr5/assets/img/pan/device.webp')
  })

  it('delivers the 27 pictures of DjamZ as WebP, and nothing else in the folder', () => {
    const folder = path.resolve(__dirname, '..', 'assets/img/pan')
    const files = fs.readdirSync(folder).sort()
    expect(files).toEqual(PAN_ICON_CATEGORIES.map(c => `${c}.webp`).sort())
    for (const file of files){
      const head = fs.readFileSync(path.join(folder, file)).subarray(0, 12)
      expect(head.toString('latin1', 0, 4), file).toBe('RIFF')
      expect(head.toString('latin1', 8, 12), file).toBe('WEBP')
    }
  })
})

describe('pan icons: the picture an item chose (lot 10)', () => {
  const gun = (flags = {
  }) => ({
    type: 'itemWeapon', flags, system: {
    }
  })

  it('reads flags.sr5.panIcon, and nothing from an empty or missing flag', () => {
    expect(customIconOf(gun({
      sr5: {
        panIcon: 'worlds/x/gun.webp'
      }
    }))).toBe('worlds/x/gun.webp')
    expect(customIconOf(gun({
      sr5: {
        panIcon: '  '
      }
    }))).toBeNull()
    expect(customIconOf(gun())).toBeNull()
    expect(customIconOf(null)).toBeNull()
  })

  it('lets the chosen picture win over the generic one and the table, and falls back on the generic one', () => {
    expect(nodeIconPathOf({
      icon: 'weapon', customIcon: 'worlds/x/gun.webp'
    }, {
      weapon: 'modules/m/weapon.webp'
    })).toBe('worlds/x/gun.webp')
    expect(nodeIconPathOf({
      icon: 'weapon', customIcon: null
    })).toBe('systems/sr5/assets/img/pan/weapon.webp')
    expect(nodeIconPathOf({
      icon: 'weapon'
    }, {
      weapon: 'modules/m/weapon.webp'
    })).toBe('modules/m/weapon.webp')
  })

  it('carries the chosen picture on the node of the graph, and it follows a copy of the item', () => {
    const own = {
      id: 'g', uuid: 'Actor.pc.Item.g', name: 'Predator', type: 'itemWeapon',
      flags: {
        sr5: {
          panIcon: 'worlds/x/gun.webp'
        }
      },
      system: {
        isWireless: true, wirelessTurnedOn: true, isActive: true, marks: []
      }
    }
    // A copy, as Item.toObject() then createEmbeddedDocuments make it: the flags go with the data
    const copy = {
      ...structuredClone(own), id: 'h', uuid: 'Actor.npc.Item.h'
    }
    for (const [actorId, weapon] of [['pc', own], ['npc', copy]]){
      const actor = {
        id: actorId, name: actorId, type: 'actorPc', items: [weapon], system: {
          matrix: {
          }
        }
      }
      const node = buildPanGraph(actor).nodes[0]
      expect(node.icon).toBe('weapon')
      expect(node.customIcon).toBe('worlds/x/gun.webp')
    }
  })

  it('draws the provisional pictograms in the crown colour, the pictures in their own', () => {
    expect(isTintedIcon('systems/sr5/assets/img/pan/weapon.svg')).toBe(true)
    expect(isTintedIcon('systems/sr5/assets/img/pan/weapon.webp')).toBe(false)
    expect(isTintedIcon(null)).toBe(false)
  })

  it('puts the category on each node of the graph', () => {
    const gun = {
      id: 'g', uuid: 'Actor.pc.Item.g', name: 'Predator', type: 'itemWeapon', flags: {
      },
      system: {
        isWireless: true, wirelessTurnedOn: true, isActive: true, isSlavedToPan: true, marks: []
      }
    }
    const deck = {
      id: 'd', uuid: 'Actor.pc.Item.d', name: 'Ikon', type: 'itemDevice', flags: {
      },
      system: {
        type: 'commlink', isWireless: true, wirelessTurnedOn: true, isActive: true, marks: [], pan: {
          content: [{
            name: 'Predator', uuid: gun.uuid
          }]
        }
      }
    }
    const pc = {
      id: 'pc', name: 'PC', type: 'actorPc', items: [deck, gun], system: {
        matrix: {
        }
      }
    }
    const g = buildPanGraph(pc, {
      resolve: uuid => uuid === gun.uuid ? gun : null
    })
    expect(g.nodes.map(n => n.icon)).toEqual(['commlink', 'weapon'])
  })
})

// A graph as getGraph renders it, every node visible unless said otherwise
function graphOf(slaves = 2, {
  loose = 0, hidden = []
} = {
}){
  const nodes = [{
    uuid: 'm', kind: 'master', mode: 'active'
  }]
  const links = [{
    from: 'owner', to: 'm'
  }]
  for (let i = 0; i < slaves; i++){
    nodes.push({
      uuid: `s${i}`, kind: 'slave', mode: i === 0 ? 'silent' : 'active'
    })
    links.push({
      from: 'm', to: `s${i}`
    })
  }
  for (let i = 0; i < loose; i++){
    nodes.push({
      uuid: `d${i}`, kind: 'device', mode: 'active'
    })
    links.push({
      from: 'owner', to: `d${i}`
    })
  }
  for (const node of nodes) node.visibility = {
    visible: !hidden.includes(node.uuid)
  }
  return {
    master: 'm', nodes, links
  }
}

describe('pan layout: constellation B', () => {
  it('puts the master in the given direction, beyond the token, and links it to the token\'s edge', () => {
    const {
      icons, lines
    } = layoutCrown(graphOf(0), {
      tokenRadius: 50, angle: 0
    })
    expect(icons[0].x).toBeCloseTo(50 + PAN_LAYOUT.masterGap)
    expect(icons[0].y).toBeCloseTo(0)
    expect(lines[0].from).toEqual({
      x: 50, y: 0
    })
  })

  it('fans the slaves around the master, each linked to it, with its own mode', () => {
    const {
      icons, lines
    } = layoutCrown(graphOf(3), {
      tokenRadius: 50, angle: 0
    })
    const master = icons.find(i => i.node.uuid === 'm')
    for (const slave of icons.filter(i => i.node.kind === 'slave')){
      expect(Math.hypot(slave.x - master.x, slave.y - master.y)).toBeCloseTo(PAN_LAYOUT.slaveRing)
    }
    const toSilent = lines.find(l => l.uuid === 's0')
    expect(toSilent.from).toEqual({
      x: master.x, y: master.y
    })
    expect(toSilent.mode).toBe('silent')
  })

  it('rings the devices slaved to nothing on the far side of the token', () => {
    const {
      icons
    } = layoutCrown(graphOf(0, {
      loose: 1
    }), {
      tokenRadius: 50, angle: 0
    })
    const device = icons.find(i => i.node.uuid === 'd0')
    expect(device.x).toBeLessThan(0)
  })

  it('draws neither the hidden nodes nor a line to them; a slave seen without its master has no line', () => {
    const {
      icons, lines
    } = layoutCrown(graphOf(2, {
      hidden: ['m', 's1']
    }), {
      tokenRadius: 50
    })
    expect(icons.map(i => i.node.uuid)).toEqual(['s0'])
    expect(lines).toHaveLength(0)
  })

  it('draws a drone on the scene as a line to its own token, with no icon', () => {
    const {
      icons, lines
    } = layoutCrown(graphOf(1), {
      tokenRadius: 50, tokenOffset: node => node.uuid === 's0' ? {
        x: 300, y: 40
      } : null
    })
    expect(icons.map(i => i.node.uuid)).toEqual(['m'])
    expect(lines.find(l => l.uuid === 's0').to).toEqual({
      x: 300, y: 40
    })
  })

  it('grows with the grid', () => {
    const {
      icons
    } = layoutCrown(graphOf(0), {
      tokenRadius: 100, angle: 0, scale: 2
    })
    expect(icons[0].radius).toBe(PAN_LAYOUT.iconRadius * 2)
    expect(icons[0].x).toBeCloseTo(100 + PAN_LAYOUT.masterGap * 2)
  })

  it('opens the crown away from the middle of the scene, upwards at the very middle', () => {
    expect(crownAngle({
      x: 200, y: 100
    }, {
      x: 100, y: 100
    })).toBeCloseTo(0)
    expect(crownAngle({
      x: 100, y: 100
    }, {
      x: 100, y: 100
    })).toBeCloseTo(-Math.PI / 2)
  })

  it('cuts a silent line into dashes', () => {
    const dashes = dashesOf({
      x: 0, y: 0
    }, {
      x: 23, y: 0
    }, 5, 5)
    expect(dashes).toEqual([[0, 0, 5, 0], [10, 0, 15, 0], [20, 0, 23, 0]])
  })
})
