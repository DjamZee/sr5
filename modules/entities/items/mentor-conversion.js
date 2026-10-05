// The Mentor Spirit quality (SR5 p. 76) linked to an itemMentorSpirit: the sheet's warnings, and the GM macro
// that converts the old-style qualities (effects carried by the quality) to the new form, or goes back.
// Rules live in mentor-link.js; this file only reads and writes Foundry documents.
import {
  mentorLinkWarnings, planMentorConversion, planMentorRevert, CONVERSION_FLAG
} from "./mentor-link.js"

const plainItems = actor => actor.items.map(i => ({
  id: i.id, type: i.type, name: i.name, system: i.system, flags: i.flags
}))

// One localized line per warning, for the "Mentor spirits" block of the character sheet
export function mentorWarningLines(actor){
  if (!actor?.items) return []
  return mentorLinkWarnings(plainItems(actor)).map(w => game.i18n.format(`SR5.MentorWarning_${w.kind}`, {
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
        description: c.description, gameEffect: c.gameEffect, customEffects: c.customEffects
      },
      flags: {
        sr5: {
          [CONVERSION_FLAG]: {
            created: true
          }
        }
      },
    }))) : []
    const idOfKey = new Map(plan.create.map((c, n) => [c.key, created[n]?.id]))
    await actor.updateEmbeddedDocuments("Item", plan.link.map(l => ({
      _id: l.qualityId,
      name: l.name,
      "system.customEffects": [],
      "system.linkedMentor": l.mentorKey ? idOfKey.get(l.mentorKey) ?? "" : l.mentorId,
      [`flags.sr5.${CONVERSION_FLAG}`]: {
        ...l.original, createdMentor: !!l.mentorKey
      },
    })))
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
    })))
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
