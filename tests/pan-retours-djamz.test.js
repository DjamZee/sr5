import {
  describe, it, expect
} from 'vitest'
import {
  actorIconCategoryOf, iconCategoryOf
} from '../modules/canvas/pan-crown/pan-icons.js'
import {
  buildPanGraph, isMatrixItem
} from '../modules/canvas/pan-crown/pan-graph.js'
import {
  layoutCrown, radialColumns, PAN_LAYOUT
} from '../modules/canvas/pan-crown/pan-layout.js'

// The feedback of DjamZ after his first game with the crown of the PAN (07/10): a crowded crown, icons of the wrong
// category, entries of the radial menu over one another.

function graphOf(slaves, loose = 0){
  const nodes = [{
    uuid: 'm', kind: 'master', mode: 'active'
  }]
  const links = [{
    from: 'owner', to: 'm'
  }]
  for (let i = 0; i < slaves; i++){
    nodes.push({
      uuid: `s${i}`, kind: 'slave', mode: 'active'
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
  return {
    master: 'm', nodes, links
  }
}

function closest(icons){
  let least = Infinity
  for (let i = 0; i < icons.length; i++){
    for (let j = i + 1; j < icons.length; j++){
      least = Math.min(least, Math.hypot(icons[i].x - icons[j].x, icons[i].y - icons[j].y))
    }
  }
  return least
}

describe('pan layout: never crowded', () => {
  it('keeps every two icons a spacing apart, marks and monitor included, up to 30 slaves and 12 loose devices', () => {
    for (const scale of [1, 2]){
      for (let slaves = 0; slaves <= 30; slaves++){
        for (const loose of [0, 1, 3, 6, 12]){
          const {
            icons
          } = layoutCrown(graphOf(slaves, loose), {
            tokenRadius: 50 * scale, scale, angle: -Math.PI / 2
          })
          expect(icons).toHaveLength(1 + slaves + loose)
          expect(closest(icons)).toBeGreaterThanOrEqual(PAN_LAYOUT.minSpacing * scale - 1e-6)
          // None over the token itself
          for (const icon of icons) expect(Math.hypot(icon.x, icon.y)).toBeGreaterThan(50 * scale + icon.radius)
        }
      }
    }
  })

  it('keeps a few slaves on one ring around the master, as on the mock-up', () => {
    const {
      icons
    } = layoutCrown(graphOf(4), {
      tokenRadius: 50, angle: 0
    })
    const master = icons.find(i => i.node.uuid === 'm')
    for (const slave of icons.filter(i => i.node.kind === 'slave')){
      expect(Math.hypot(slave.x - master.x, slave.y - master.y)).toBeCloseTo(PAN_LAYOUT.slaveRing)
    }
  })

  it('opens a second ring further out beyond what the first one holds', () => {
    const {
      icons
    } = layoutCrown(graphOf(8), {
      tokenRadius: 50, angle: 0
    })
    const master = icons.find(i => i.node.uuid === 'm')
    const rings = new Set(icons.filter(i => i.node.kind === 'slave')
      .map(s => Math.round(Math.hypot(s.x - master.x, s.y - master.y))))
    expect(rings).toEqual(new Set([PAN_LAYOUT.slaveRing, PAN_LAYOUT.slaveRing + PAN_LAYOUT.minSpacing]))
  })

  it('turns the outer ring so that its lines run between the icons of the inner one', () => {
    // An icon on the inner ring hides the line of an outer one when their directions from the master are closer
    // than its own width seen from the master. Up to 6 slaves the lines run clear; at 8, four outer icons cannot all
    // find a gap between four inner ones within the fan: their lines cross the rim of a disc, beside its picture (0.8 radius).
    const clear = Math.asin(1.32 * PAN_LAYOUT.iconRadius / PAN_LAYOUT.slaveRing)
    const grazing = Math.asin(0.8 * PAN_LAYOUT.iconRadius / PAN_LAYOUT.slaveRing)
    for (const [slaves, hidden] of [[5, clear], [6, clear], [8, grazing]]){
      const {
        icons
      } = layoutCrown(graphOf(slaves), {
        tokenRadius: 50, angle: 0
      })
      const master = icons.find(i => i.node.uuid === 'm')
      const polar = icons.filter(i => i.node.kind === 'slave').map(s => ({
        r: Math.round(Math.hypot(s.x - master.x, s.y - master.y)), a: Math.atan2(s.y - master.y, s.x - master.x)
      }))
      const inner = polar.filter(p => p.r === PAN_LAYOUT.slaveRing)
      const outer = polar.filter(p => p.r === PAN_LAYOUT.slaveRing + PAN_LAYOUT.minSpacing)
      for (const o of outer) for (const i of inner) expect(Math.abs(o.a - i.a)).toBeGreaterThan(hidden)
    }
  })

  it('gives no place in a ring to a drone on its own token', () => {
    const {
      icons
    } = layoutCrown(graphOf(3), {
      tokenRadius: 50, angle: 0, tokenOffset: node => node.uuid === 's1' ? {
        x: 400, y: 0
      } : null
    })
    expect(icons.map(i => i.node.uuid)).toEqual(['m', 's0', 's2'])
    const master = icons[0]
    const [a, b] = icons.slice(1)
    // Two slaves left: the narrow fan of two, not three with a hole in the middle
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * PAN_LAYOUT.slaveRing * Math.sin(0.62))
    expect(Math.hypot(a.x - master.x, a.y - master.y)).toBeCloseTo(PAN_LAYOUT.slaveRing)
  })
})

const item = (type, system = {
}, name = '') => ({
  type, name, system
})
const actor = (type, system = {
}, name = '') => ({
  type, name, system
})

describe('pan icons: the picture of what it is', () => {
  it('gives the base device of an actor the picture of the actor', () => {
    const base = item('itemDevice', {
      type: 'baseDevice'
    }, 'Appareil')
    expect(iconCategoryOf(base, actor('actorDrone', {
      type: 'drone'
    }))).toBe('drone')
    expect(iconCategoryOf(base, actor('actorDrone', {
      type: 'vehicle'
    }))).toBe('vehicle')
    expect(iconCategoryOf(base, actor('actorSprite'))).toBe('sprite')
    expect(iconCategoryOf(base, actor('actorAgent'))).toBe('agent')
    for (const [deviceType, category] of [['host', 'host'], ['ice', 'ice'], ['maglock', 'maglock']]){
      expect(iconCategoryOf(base, actor('actorDevice', {
        matrix: {
          deviceType
        }
      }, 'Porte'))).toBe(category)
    }
    // A character has no base device: the generic device
    expect(iconCategoryOf(base, actor('actorPc'))).toBe('device')
    // The parent stands for the holder by default
    expect(iconCategoryOf({
      ...base, parent: actor('actorSprite')
    })).toBe('sprite')
  })

  it('reads in its name what a device of the scenery is, in French and in English', () => {
    const decor = name => actorIconCategoryOf(actor('actorDevice', {
      matrix: {
        deviceType: 'device'
      }
    }, name))
    expect(decor('Caméra de surveillance')).toBe('camera')
    expect(decor('Security camera')).toBe('camera')
    expect(decor('Porte du hall')).toBe('door')
    expect(decor('Blast door')).toBe('door')
    expect(decor('Porte à maglock')).toBe('maglock')
    expect(decor('Détecteur de mouvement')).toBe('sensor')
    expect(decor('Capteur de pression')).toBe('sensor')
    expect(decor('Tourelle automatique')).toBe('turret')
    expect(decor('Ascenseur B')).toBe('elevator')
    expect(decor('Éclairage du parking')).toBe('light')
    expect(decor('Terminal de la réception')).toBe('terminal')
    expect(decor('Distributeur de soja')).toBe('device')
    // Or in the name of its device
    expect(actorIconCategoryOf(actor('actorDevice', {
      matrix: {
        deviceType: 'slavedDevice'
      }
    }, 'Hall'), {
      name: 'Caméra'
    })).toBe('camera')
  })

  it('takes a camera, a sensor or a maglock of the gear for one, and nothing else', () => {
    expect(iconCategoryOf(item('itemGear', {
    }, 'Micro-caméra'))).toBe('camera')
    expect(iconCategoryOf(item('itemGear', {
    }, 'Senseur (Détecteur de mouvement)'))).toBe('sensor')
    expect(iconCategoryOf(item('itemGear', {
    }, 'Maglock'))).toBe('maglock')
    for (const name of ['Passe maglock', 'Kit de Serrurerie', 'Marqueurs senseurs', 'Lunettes']){
      expect(iconCategoryOf(item('itemGear', {
      }, name))).toBe('device')
    }
  })

  it('shows an implanted weapon as a weapon', () => {
    expect(iconCategoryOf(item('itemAugmentation', {
      category: 'cyberweapon', type: 'cyberware'
    }))).toBe('weapon')
  })

  it('leaves bioware, genetech and symbionts out of the Matrix (SR5 p. 462)', () => {
    for (const type of ['bioware', 'culturedBioware', 'genetech', 'symbionts']){
      expect(isMatrixItem(item('itemAugmentation', {
        type, isWireless: true
      }))).toBe(false)
    }
    expect(isMatrixItem(item('itemAugmentation', {
      type: 'cyberware', isWireless: true
    }))).toBe(true)
  })

  it('draws no bioware in a crown', () => {
    const deck = {
      id: 'deck', uuid: 'Actor.pc.Item.deck', name: 'Commlink', type: 'itemDevice', system: {
        type: 'commlink', isActive: true, isWireless: true, wirelessTurnedOn: true, marks: [], pan: {
          content: []
        }
      }
    }
    const pump = {
      id: 'pump', uuid: 'Actor.pc.Item.pump', name: 'Pompe à adrénaline', type: 'itemAugmentation', system: {
        type: 'bioware', isActive: true, isWireless: true, wirelessTurnedOn: true, marks: []
      }
    }
    const pc = {
      id: 'pc', name: 'PC', type: 'actorPc', items: [deck, pump], system: {
        matrix: {
        }
      }
    }
    expect(buildPanGraph(pc).nodes.map(n => n.name)).toEqual(['Commlink'])
  })

  it('gives a drone, a host and a camera their own picture in their own crown', () => {
    const own = (type, system, name) => {
      const a = {
        id: name, name, type, items: [], system: {
          matrix: {
          }, ...system
        }
      }
      a.items.push({
        id: `${name}-dev`, uuid: `Actor.${name}.Item.dev`, name: 'Appareil', type: 'itemDevice', parent: a, system: {
          type: 'baseDevice', isActive: true, isWireless: true, wirelessTurnedOn: true, marks: []
        }
      })
      const node = buildPanGraph(a).nodes[0]
      // Named on hover after the actor, not "Appareil" as every base device is
      expect(node.name).toBe(name)
      return node.icon
    }
    expect(own('actorDrone', {
      type: 'drone'
    }, 'Fly-Spy')).toBe('drone')
    expect(own('actorDevice', {
      matrix: {
        deviceType: 'host'
      }
    }, 'Serveur')).toBe('host')
    expect(own('actorDevice', {
      matrix: {
        deviceType: 'device'
      }
    }, 'Caméra du hall')).toBe('camera')
  })
})

describe('pan radial menu: never overlapping', () => {
  it('stacks the entries in rows, the actions on the right, the owner\'s and the gamemaster\'s on the left', () => {
    // The fullest menu: 16 actions (a master, persona actions and Jump into Rigged Device), 3 modes, the PAN, the
    // gamemaster's reveal
    const step = 27
    const {
      right, left, radius
    } = radialColumns({
      right: [16], left: [4, 1]
    }, {
      step, familyGap: 10, minRadius: 90
    })
    expect(right).toHaveLength(16)
    expect(left).toHaveLength(5)
    for (const column of [right, left]){
      for (let i = 1; i < column.length; i++) expect(column[i].y - column[i - 1].y).toBeGreaterThanOrEqual(step)
      for (const at of column) expect(at.x).toBeGreaterThan(0)
    }
    // The families apart
    expect(left[4].y - left[3].y).toBe(step + 10)
    // An arc: the middle rows further out than the end ones, all on one circle
    expect(right[8].x).toBeGreaterThan(right[0].x)
    for (const at of right) expect(Math.hypot(at.x, at.y)).toBeCloseTo(radius.right)
    // The short column on its own, closer arc
    expect(radius.left).toBeLessThan(radius.right)
  })

  it('keeps a small menu close to the icon', () => {
    const {
      radius, right
    } = radialColumns({
      right: [2]
    }, {
      step: 27, minRadius: 90
    })
    expect(radius.right).toBe(90)
    expect(right.map(r => r.y)).toEqual([-13.5, 13.5])
  })
})
