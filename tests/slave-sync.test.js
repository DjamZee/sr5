import {
  describe, it, expect
} from 'vitest'
import {
  panIndexOf, panChangeFor
} from '../modules/system/slave-sync.js'

// Lot R5 : la case « Appareil asservi » du drone et la liste du PAN du rigger ne font qu'un
describe('panIndexOf', () => {
  const vehicle = {
    id: "veh1", uuid: "Actor.rig.Item.veh1"
  }
  it('retrouve le véhicule par son uuid ou par son id', () => {
    expect(panIndexOf([{
      uuid: "Actor.x.Item.other"
    }, {
      uuid: "Actor.rig.Item.veh1"
    }], vehicle)).toBe(1)
    // Rigger non lié : la liste porte l'uuid de l'objet de l'acteur du monde
    expect(panIndexOf([{
      uuid: "Actor.world.Item.veh1"
    }], vehicle)).toBe(0)
    expect(panIndexOf([], vehicle)).toBe(-1)
    expect(panIndexOf(undefined, vehicle)).toBe(-1)
  })
})

describe('panChangeFor', () => {
  it('ajoute à la liste quand la case est cochée', () => {
    expect(panChangeFor(true, -1, {
      current: 1, max: 9
    })).toBe("add")
  })
  it('retire de la liste quand la case est décochée', () => {
    expect(panChangeFor(false, 2, {
      current: 3, max: 9
    })).toBe("remove")
  })
  it('ne fait rien quand la liste est déjà d\'accord', () => {
    expect(panChangeFor(true, 0, {
      current: 1, max: 9
    })).toBe(null)
    expect(panChangeFor(false, -1, {
      current: 1, max: 9
    })).toBe(null)
  })
  it('n\'ajoute rien à un PAN plein : la case seule asservit (décision du 08/10)', () => {
    expect(panChangeFor(true, -1, {
      current: 9, max: 9
    })).toBe(null)
  })
})
