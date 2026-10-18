import {
  describe, it, expect
} from "vitest"
import {
  computeLayout
} from "../modules/interface/compute-layout.js"
import {
  computeItemLayout
} from "../modules/interface/compute-item-layout.js"
import {
  TAB_ICONS
} from "../modules/interface/block-registry.js"

// Lot N4 (nettoyage du code): computeLayout and computeItemLayout share one builder.
// These snapshots were taken BEFORE the merge; they pin the resolved layouts so the
// shared builder gives the same output for every default layout and a few custom ones.

const ACTOR_SHEETS = ['SR5ActorSheet', 'SR5GruntSheet', 'SR5SpiritSheet', 'SR5DroneSheet', 'SR5SpriteSheet',
  'SR5AppareilSheet', 'SR5AgentSheet', 'SR5StorageSheet', 'UnknownSheet']

const ITEM_TYPES = ['itemWeapon', 'itemArmor', 'itemAugmentation', 'itemGear', 'itemDevice', 'itemSpell',
  'itemComplexForm', 'itemAdeptPower', 'itemQuality', 'itemProgram', 'itemFocus', 'itemDrug', 'itemToxin',
  'itemRitual', 'itemPreparation', 'itemPower', 'itemMartialArt', 'itemTradition', 'itemSpirit', 'itemSpiritType',
  'itemMentorSpirit', 'itemSprite', 'itemSpritePower', 'itemVehicleMod', 'itemMetamagic', 'itemMark', 'itemEffect',
  'itemEcho', 'itemVehicle', 'itemSin', 'itemFile', 'itemStorage', 'itemLifestyle', 'itemContact',
  'itemAmmunition', 'itemAmmunitionType', 'itemKarma', 'itemKnowledge', 'itemLanguage', 'itemNuyen',
  'itemReputation', 'itemUnknown']

// Custom layouts as the "Personnaliser l'affichage" dialog saves them, with the edge cases
// the builder handles: hidden panel / tab / block, unknown block id, empty tab, column past
// the panel width, double block in a 3-column panel, legacy .svg.hbs icon, unknown iconKey.
const CUSTOM_LAYOUTS = {
  twoPanels: {
    panels: [
      {
        id: 'p-side', width: 1, tabs: [
          {
            id: 't1', label: 'Side', iconKey: 'core', blocks: [
              {
                id: 'attributes'
              }, {
                id: 'limits', uid: 'limits-2'
              }
            ]
          },
        ]
      },
      {
        id: 'p-main', width: 2, tabs: [
          {
            id: 't2', label: 'Combat', blocks: [
              {
                id: 'attributes', column: 0
              }, {
                id: 'limits', column: 5
              },
              {
                id: 'description'
              }, {
                id: 'attributes', column: 1, hidden: true
              },
            ]
          },
          {
            id: 't3', label: 'Empty', blocks: [{
              id: 'no-such-block'
            }]
          },
          {
            id: 't4', label: 'Hidden', hidden: true, blocks: [{
              id: 'description'
            }]
          },
        ]
      },
      {
        id: 'p-hidden', hidden: true, tabs: [{
          id: 't5', blocks: [{
            id: 'description'
          }]
        }]
      },
    ],
  },
  threeColumns: {
    panels: [
      {
        id: 'p3', width: 3, tabs: [
          {
            id: 'a', label: 'A', icon: `${TAB_ICONS.magic}.hbs`, blocks: [
              {
                id: 'description', column: 1
              },
              {
                id: 'attributes', column: 2
              },
              {
                id: 'description'
              },
            ]
          },
          {
            id: 'b', iconKey: 'not-an-icon', blocks: [{
              id: 'limits', column: 0
            }]
          },
        ]
      },
    ],
  },
  emptyPanels: {
    panels: []
  },
}

describe("N4: computeLayout keeps its output", () => {
  for (const sheet of ACTOR_SHEETS) {
    it(`default layout of ${sheet}`, () => {
      expect(computeLayout(sheet)).toMatchSnapshot()
      expect(computeLayout(sheet, {
      })).toEqual(computeLayout(sheet))
    })
  }

  for (const [name, customLayout] of Object.entries(CUSTOM_LAYOUTS)) {
    it(`custom layout ${name}`, () => {
      expect(computeLayout('SR5ActorSheet', {
        customLayout
      })).toMatchSnapshot()
    })
  }
})

describe("N4: computeItemLayout keeps its output", () => {
  for (const type of ITEM_TYPES) {
    it(`default layout of ${type}`, () => {
      expect(computeItemLayout(type)).toMatchSnapshot()
    })
  }
})
