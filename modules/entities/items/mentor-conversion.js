// The Mentor Spirit quality (SR5 p. 76) linked to an itemMentorSpirit: the sheet's warnings, and the GM macro
// that converts the old-style qualities (effects carried by the quality) to the new form, or goes back.
// Rules live in mentor-link.js; this file only reads and writes Foundry documents.
import {
  mentorLinkWarnings, planMentorConversion, planMentorMigration, planMentorRevert, CONVERSION_FLAG, REVERTED_FLAG, mentorResistAttributes
} from "./mentor-link.js"
import {
  systemEffectWrite
} from "../../system/effect-editor.js"
import {
  activeMegapackId
} from "../../system/megapack.js"

const plainItems = actor => actor.items.map(i => ({
  id: i.id, type: i.type, name: i.name, system: i.system, flags: i.flags
}))

// One localized line per warning, for the "Mentor spirits" block of the character sheet
export function mentorWarningLines(actor){
  if (!actor?.items) return []
  return mentorLinkWarnings(plainItems(actor), actor.system?.magic?.magicType).map(w => game.i18n.format(`SR5.MentorWarning_${w.kind}`, {
    mentor: w.mentor ?? "", quality: w.quality ?? ""
  }))
}

// The actors a run covers: the ones given, or those the GM picks in a dialog
async function actorsFor({
  actor, all
} = {
}){
  if (!game.user.isGM){
    ui.notifications.warn(game.i18n.localize("SR5.MentorConversionGMOnly"))
    return null
  }
  if (actor) return [actor]
  if (all) return game.actors.contents
  const choice = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("SR5.MentorConversionTitle")
    },
    content: `<p>${game.i18n.localize("SR5.MentorConversionScope")}</p>`,
    buttons: [
      {
        action: "selected", label: game.i18n.localize("SR5.MentorConversionSelected"), default: true
      },
      {
        action: "all", label: game.i18n.localize("SR5.MentorConversionAll")
      },
    ],
    rejectClose: false,
  })
  if (choice === "all") return game.actors.contents
  if (choice !== "selected") return null
  const selected = canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character
  if (!selected){
    ui.notifications.warn(game.i18n.localize("SR5.MentorConversionNoActor"))
    return null
  }
  return [selected]
}

async function whisperSummary(titleKey, lines){
  const body = lines.length ? `<ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul>` : `<p>${game.i18n.localize("SR5.MentorConversionNothing")}</p>`
  await ChatMessage.create({
    content: `<h3>${game.i18n.localize(titleKey)}</h3>${body}`,
    whisper: ChatMessage.getWhisperRecipients("GM"),
  })
}

const list = names => names.length ? names.join(", ") : "—"

// The planned qualities renamed, emptied of their effects and linked to their mentor (created[n] made for plan.create[n]);
// the original kept in the flag, for revertMentorConversion
async function linkConvertedQualities(actor, plan, created){
  const idOfKey = new Map(plan.create.map((c, n) => [c.key, created[n]?.id]))
  await actor.updateEmbeddedDocuments("Item", plan.link.map(l => ({
    _id: l.qualityId,
    name: l.name,
    "system.customEffects": [],
    "system.linkedMentor": l.mentorKey ? idOfKey.get(l.mentorKey) ?? "" : l.mentorId,
    [`flags.sr5.${CONVERSION_FLAG}`]: {
      ...l.original, createdMentor: !!l.mentorKey
    },
    [`flags.sr5.-=${REVERTED_FLAG}`]: null,
  })), systemEffectWrite())
}

// Old-style mentor qualities -> one mentor item per mentor + the quality linked to it. Never deletes a quality.
export async function convertMentorQualities(options = {
}){
  const actors = await actorsFor(options)
  if (!actors) return
  const qualityName = game.i18n.localize("SR5.MentorQualityName")
  const lines = []
  for (const actor of actors){
    const plan = planMentorConversion(plainItems(actor), qualityName)
    if (!plan.link.length) continue
    const created = plan.create.length ? await actor.createEmbeddedDocuments("Item", plan.create.map(c => ({
      name: c.name, type: "itemMentorSpirit",
      system: {
        description: c.description, gameEffect: c.gameEffect, customEffects: c.customEffects, mysticPath: c.mysticPath ?? "",
        //Chaos, Oracle, Peacemaker resist their drawback with other attributes (Street Grimoire p. 200-201)
        ...(mentorResistAttributes(c.name) ? {
          resistAttributes: mentorResistAttributes(c.name)
        } : {
        })
      },
      flags: {
        sr5: {
          [CONVERSION_FLAG]: {
            created: true
          }
        }
      },
    }))) : []
    await linkConvertedQualities(actor, plan, created)
    const reused = [...new Set(plan.link.filter(l => l.mentorId).map(l => actor.items.get(l.mentorId)?.name).filter(Boolean))]
    lines.push(game.i18n.format("SR5.MentorConversionLine", {
      actor: actor.name,
      created: list(created.map(m => m.name)),
      reused: list(reused),
      qualities: list(plan.link.map(l => l.original.name)),
    }))
  }
  await whisperSummary("SR5.MentorConversionTitle", lines)
}

// Back to the old form: names and effects restored, link and flag removed, created mentors deleted by id
export async function revertMentorConversion(options = {
}){
  const actors = await actorsFor(options)
  if (!actors) return
  const lines = []
  for (const actor of actors){
    const plan = planMentorRevert(plainItems(actor))
    if (!plan.restore.length) continue
    await actor.updateEmbeddedDocuments("Item", plan.restore.map(r => ({
      _id: r.qualityId,
      name: r.name,
      "system.customEffects": r.customEffects,
      "system.linkedMentor": "",
      [`flags.sr5.-=${CONVERSION_FLAG}`]: null,
      [`flags.sr5.${REVERTED_FLAG}`]: true,
    })), systemEffectWrite())
    const removed = plan.remove.map(id => actor.items.get(id)?.name).filter(Boolean)
    const ids = plan.remove.filter(id => actor.items.has(id))
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids)
    lines.push(game.i18n.format("SR5.MentorRevertLine", {
      actor: actor.name,
      qualities: list(plan.restore.map(r => r.name)),
      removed: list(removed),
    }))
  }
  await whisperSummary("SR5.MentorRevertTitle", lines)
}

// The mentor items of the active Megapack (full or Lite), by their lowercased name: {uuid}. Empty without one.
async function megapackMentors(){
  const id = activeMegapackId()
  const pack = id ? game.packs.get(`${id}.sr5-megapack-items`) : null
  if (!pack) return new Map()
  const index = await pack.getIndex()
  return new Map(index.filter(e => e.type === "itemMentorSpirit").map(e => [e.name.trim().toLowerCase(), e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`]))
}

// Ready hook (DjamZ, 16/10: the quality is bought, the mentor item carries the effects). The active GM converts, at
// each load, the world actors that still hold a former quality « Esprit mentor (X) [Magicien|Adepte] »: the quality
// becomes the Mentor Spirit quality, linked to a copy of the Megapack's mentor item (or to one of the same name already
// on the actor). Idempotent, no button: a converted actor is skipped. The GM is told once, by a whisper, which
// characters were converted and which stay as they were (no Megapack, no mentor item of that name): those are noted
// in a world setting so that the same line does not come back at every load. revertMentorConversion undoes it.
export async function runMentorMigration(){
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return
  const sources = await megapackMentors()
  const qualityName = game.i18n.localize("SR5.MentorQualityName")
  const warned = new Set(game.settings.get("sr5", "mentorMigrationWarned") ?? [])
  const converted = [], missing = [], keys = []
  for (const actor of game.actors){
    const plan = planMentorMigration(plainItems(actor), [...sources.keys()], qualityName, actor.system?.magic?.magicType)
    for (const m of plan.missing){
      const key = `${actor.id}.${m.qualityId}`
      keys.push(key)
      if (!warned.has(key)) missing.push(game.i18n.format("SR5.MentorMigrationMissing", {
        actor: actor.name, quality: m.name
      }))
      console.warn(`SR5 | mentor not migrated: ${actor.name} (${actor.id}), « ${m.name} »: ${sources.size ? "no mentor item of that name in the Megapack" : "no Megapack active"}`)
    }
    if (!plan.link.length) continue
    try {
      const data = []
      for (const c of plan.create){
        const source = await fromUuid(sources.get(c.key))
        const copy = source.toObject()
        for (const k of ["_id", "folder", "sort", "ownership"]) delete copy[k]
        foundry.utils.setProperty(copy, "_stats.compendiumSource", source.uuid)
        foundry.utils.setProperty(copy, `flags.sr5.${CONVERSION_FLAG}`, {
          created: true
        })
        if (c.mysticPath) copy.system.mysticPath = c.mysticPath
        data.push(copy)
      }
      const created = data.length ? await actor.createEmbeddedDocuments("Item", data) : []
      await linkConvertedQualities(actor, plan, created)
      converted.push(game.i18n.format("SR5.MentorMigrationLine", {
        actor: actor.name, mentors: list([...new Set([...created.map(m => m.name), ...plan.link.filter(l => l.mentorId).map(l => actor.items.get(l.mentorId)?.name).filter(Boolean)])])
      }))
    } catch (err){
      console.error(`SR5 | mentor migration failed for ${actor.name} (${actor.id})`, err)
    }
  }
  if (converted.length || missing.length){
    const parts = [
      converted.length ? `<p>${game.i18n.localize("SR5.MentorMigrationConverted")}</p><ul>${converted.map(l => `<li>${l}</li>`).join("")}</ul>` : "",
      missing.length ? `<p>${game.i18n.localize("SR5.MentorMigrationLeft")}</p><ul>${missing.map(l => `<li>${l}</li>`).join("")}</ul>` : "",
    ]
    await ChatMessage.create({
      content: `<h3>${game.i18n.localize("SR5.MentorMigrationTitle")}</h3>${parts.join("")}`,
      whisper: ChatMessage.getWhisperRecipients("GM"),
    })
  }
  // Only the actors still left as they were stay noted: one converted later, then reverted, would be told again
  const still = keys.sort()
  if (JSON.stringify(still) !== JSON.stringify([...warned].sort())) await game.settings.set("sr5", "mentorMigrationWarned", still)
}
