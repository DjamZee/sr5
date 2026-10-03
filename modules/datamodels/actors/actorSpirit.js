import {
  sheetPreferencesPartialModel 
} from './partial/sheetPreferences.js'
import {
  characterAttributesPartialModel 
} from './partial/attributes.js'
import {
  characterMagicAttributesPartialModel 
} from './partial/magicAttributes.js'
import {
  characterLimitsPartialModel 
} from './partial/limits.js'
import {
  characterDefensesPartialModel 
} from './partial/defenses.js'
import {
  characterResistancesPartialModel 
} from './partial/resistances.js'
import {
  characterDerivedAttributesPartialModel 
} from './partial/derivedAttributes.js'
import {
  characterEssencePartialModel 
} from './partial/essence.js'
import {
  characterMovementsPartialModel 
} from './partial/movements.js'
import {
  characterWeightActionsPartialModel 
} from './partial/weightActions.js'
import {
  characterReachPartialModel 
} from './partial/reach.js'
import {
  skillGroupsPartialModel 
} from './partial/skillGroups.js'
import {
  recoilPartialModel 
} from './partial/recoil.js'
import {
  penaltiesPartialModel 
} from './partial/penalties.js'
import {
  visionPartialModel 
} from './partial/vision.js'
import {
  specialPropertiesPartialModel 
} from './partial/specialProperties.js'
import {
  itemsPropertiesPartialModel 
} from './partial/itemsProperties.js'
import {
  magicPartialModel 
} from './partial/magic.js'
import {
  allSkillFields, baseSkillSchema 
} from './partial/skills.js'
import {
  sr5ModsPartialModel 
} from '../common/mods.js'
import {
  SR5_SpiritTypes
} from '../../entities/items/spirit-types.js'

/**
 * A watcher or homunculus summoned before conditionMonitors.condition existed kept its damage in
 * Physical (and Stun), which preparation now drops. Its stored source has no condition.actual.base,
 * which no spirit saved since can lack: read the old damage there, without writing anything.
 * Once the condition monitor is written (damage, healing, dismissal), the key exists and this stops.
 */
export function migrateLegacySingleMonitor(source) {
  const monitors = source?.conditionMonitors
  if (!monitors || !SR5_SpiritTypes.hasSingleMonitor(source.type)) return source
  if (monitors.condition?.actual?.base !== undefined) return source
  const damage = Math.max(Number(monitors.physical?.actual?.base) || 0, Number(monitors.stun?.actual?.base) || 0)
  if (!damage) return source
  monitors.condition ??= {
  }
  monitors.condition.actual ??= {
  }
  monitors.condition.actual.base = damage
  return source
}

export class sr5ActorSpiritDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields

    return {
      ...sheetPreferencesPartialModel.defineSchema(),
      ...characterAttributesPartialModel.defineSchema(),
      ...characterMagicAttributesPartialModel.defineSchema(),
      ...characterLimitsPartialModel.defineSchema(),
      ...characterDefensesPartialModel.defineSchema(),
      ...characterResistancesPartialModel.defineSchema(),
      ...characterDerivedAttributesPartialModel.defineSchema(),
      ...characterEssencePartialModel.defineSchema(),
      ...characterMovementsPartialModel.defineSchema(),
      ...characterWeightActionsPartialModel.defineSchema(),
      ...characterReachPartialModel.defineSchema(),
      ...skillGroupsPartialModel.defineSchema(),
      ...recoilPartialModel.defineSchema(),
      ...penaltiesPartialModel.defineSchema(),
      ...visionPartialModel.defineSchema(),
      ...specialPropertiesPartialModel.defineSchema(),
      ...itemsPropertiesPartialModel.defineSchema(),
      ...magicPartialModel.defineSchema(),
      skills: new fields.SchemaField({
        ...allSkillFields(),
        flight: new fields.SchemaField({
          ...baseSkillSchema('agility', 'physicalLimit', '', 'physicalSkills', true)
        }),
      }),
      languageSkills: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema()
      }),
      knowledgeSkills: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema()
      }),
      initiatives: new fields.SchemaField({
        astralInit: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          dice: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 0
            }),
            base: new fields.NumberField({
              initial: 2
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
          }),
          isActive: new fields.BooleanField({
            initial: false
          }),
        }),
        physicalInit: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          dice: new fields.SchemaField({
            value: new fields.NumberField({
              initial: 0
            }),
            base: new fields.NumberField({
              initial: 1
            }),
            modifiers: new fields.ArrayField(new fields.ObjectField()),
          }),
          isActive: new fields.BooleanField({
            initial: false
          }),
        }),
      }),
      conditionMonitors: new fields.SchemaField({
        // Single condition monitor of watchers and homunculi (SR5 p. 301); dropped at preparation for other spirits
        condition: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          actual: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          boxes: new fields.ArrayField(new fields.ObjectField()),
        }),
        physical: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          actual: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          boxes: new fields.ArrayField(new fields.ObjectField()),
          // Aggravated wounds (Howling Shadows p. 213): number of boxes that count double for healing
          aggravated: new fields.NumberField({
            initial: 0
          }),
        }),
        stun: new fields.SchemaField({
          ...sr5ModsPartialModel.defineSchema(),
          actual: new fields.SchemaField({
            ...sr5ModsPartialModel.defineSchema()
          }),
          boxes: new fields.ArrayField(new fields.ObjectField()),
        }),
      }),
      statusBars: new fields.SchemaField({
        condition: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 0
          }),
          max: new fields.NumberField({
            initial: 0
          }),
        }),
        physical: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 0
          }),
          max: new fields.NumberField({
            initial: 0
          }),
        }),
        stun: new fields.SchemaField({
          value: new fields.NumberField({
            initial: 0
          }),
          max: new fields.NumberField({
            initial: 0
          }),
        }),
      }),
      force: new fields.SchemaField({
        ...sr5ModsPartialModel.defineSchema()
      }),
      type: new fields.StringField({
        initial: ''
      }),
      services: new fields.SchemaField({
        value: new fields.NumberField({
          initial: 0
        }),
        max: new fields.NumberField({
          initial: 0
        }),
      }),
      isMaterializing: new fields.BooleanField({
        initial: false
      }),
      summonerMagic: new fields.NumberField({
        initial: 0
      }),
      creatorId: new fields.StringField({
        initial: ''
      }),
      creatorItemId: new fields.StringField({
        initial: ''
      }),
      isBounded: new fields.BooleanField({
        initial: false
      }),
    }
  }

  static migrateData(source) {
    migrateLegacySingleMonitor(source)
    return super.migrateData(source)
  }
}
