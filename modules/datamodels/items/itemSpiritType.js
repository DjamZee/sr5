import {
  descriptionPartialModel
} from './partial/description.js'

/**
 * A GM-authored spirit type: everything the hard-coded switches decide for the
 * 33 official types, expressed as data so a table can add its own.
 *
 * Absolute values are nullable: left empty, they are inherited from the type
 * named by `basedOn`, or from the generic spirit defaults when it is empty.
 * Everything else (attribute modifiers, skills, powers) is additive.
 */
export class sr5ItemSpiritTypeDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields

    const attribute = () => new fields.SchemaField({
      modifier: new fields.NumberField({
        initial: 0, integer: true
      }),
      override: new fields.NumberField({
        initial: null, nullable: true, integer: true, min: 0
      }),
    })

    return {
      ...descriptionPartialModel.defineSchema(),
      // Identifier written into an actor's system.type. Stable across worlds.
      key: new fields.StringField({
        initial: '', blank: true
      }),
      // Official spirit type whose rules apply before this one's own values.
      basedOn: new fields.StringField({
        initial: '', blank: true
      }),
      attributes: new fields.SchemaField({
        body: attribute(),
        agility: attribute(),
        reaction: attribute(),
        strength: attribute(),
        willpower: attribute(),
        logic: attribute(),
        intuition: attribute(),
        charisma: attribute(),
      }),
      // Astral Combat, Assensing and Perception, which every spirit gets.
      baseSkillsRatio: new fields.StringField({
        initial: '', blank: true
      }),
      // Those of the three the type does not have at all (Howling Shadows p. 130-155: the Chindi have no Assensing).
      noBaseSkills: new fields.ArrayField(new fields.StringField()),
      // Skills the type grants, at Force and at half Force.
      skills: new fields.ArrayField(new fields.StringField()),
      halfSkills: new fields.ArrayField(new fields.StringField()),
      initiative: new fields.SchemaField({
        physicalDice: new fields.NumberField({
          initial: null, nullable: true, integer: true, min: 0
        }),
        astralDice: new fields.NumberField({
          initial: null, nullable: true, integer: true, min: 0
        }),
        astralBonus: new fields.NumberField({
          initial: 0, integer: true
        }),
        // Flat bonus on (REA + INT): "[(P x 2) + 1] + 2D6" when REA and INT stay at P (Howling Shadows p. 130)
        physicalBonus: new fields.NumberField({
          initial: 0, integer: true
        }),
      }),
      // Summoned by the Summoning skill. The extraplanar entities are not (DjamZ's ruling, 2026-10-07: the book
      // gives no conjuring of them); the gamemaster ticks the box for an exception.
      summonable: new fields.BooleanField({
        initial: true
      }),
      // "" no Edge of its own (a summoned spirit borrows its summoner's, SR5 p. 306), "half" P/2, "full" P
      edge: new fields.StringField({
        initial: '', blank: true
      }),
      // Added to the Essence, which is the Force: "ESS P-2" (Howling Shadows p. 131)
      essenceModifier: new fields.NumberField({
        initial: 0, integer: true
      }),
      // "" from the attributes, "force" (P x 4) / 3 for the three limits (Howling Shadows p. 130)
      limits: new fields.StringField({
        initial: '', blank: true
      }),
      // Added to the Physical one of those: "Physique (P x 4)/3 + 1" (Dark Terrors p. 52)
      physicalLimitBonus: new fields.NumberField({
        initial: 0, integer: true
      }),
      // (P x forceMultiplier) + bonus; kind "" ordinary, "hardened", "mystic" (mystic and hardened)
      armor: new fields.SchemaField({
        forceMultiplier: new fields.NumberField({
          initial: 0, integer: true, min: 0
        }),
        bonus: new fields.NumberField({
          initial: 0, integer: true
        }),
        kind: new fields.StringField({
          initial: '', blank: true
        }),
      }),
      // Items a spirit of this type is given when it is created: natural weapons, powers the official list
      // does not have, spells. Copies, dropped on the type's sheet.
      items: new fields.ArrayField(new fields.ObjectField()),
      // "" inherits, "standard" gives Physical + Stun, "single" a lone monitor.
      conditionMonitor: new fields.StringField({
        initial: '', blank: true
      }),
      powers: new fields.ArrayField(new fields.StringField()),
      optionalPowers: new fields.ArrayField(new fields.StringField()),
    }
  }
}
