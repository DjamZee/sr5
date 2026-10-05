// Invisibility and Mask on the canvas (roll-helpers/illusion.js holds the rules, this file reads Foundry).
// The cast card and the resistance card are their authors' to write: the threshold and who has seen through
// the illusion live in a hidden world setting, written by the active GM alone when those cards arrive
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  ledgerAfterCast, ledgerAfterResistance, ledgerWithout, unpiercedIllusions, blindFireOffer
} from "../rolls/roll-helpers/illusion.js"

export const ILLUSION_LEDGER = "sr5IllusionLedger"

export function registerIllusionSetting(){
  game.settings.register("sr5", ILLUSION_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
}

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

function ledger(){
  try {
    return game.settings.get("sr5", ILLUSION_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

// A spell counts while it is sustained: its item still there and switched on (the hands on the sheet)
export function isSustained(spellUuid){
  const item = globalThis.fromUuidSync?.(spellUuid)
  return !!item?.system?.isActive
}

async function recordCast(message, data){
  const item = await fromUuid(data.owner.itemUuid)
  const kind = item?.system?.illusionPierce
  if (!kind || !(data.roll?.hits > 0)) return
  //The subject: the targeted token, or the caster himself when he targeted nobody
  const subject = (data.target?.hasTarget && SR5_EntityHelpers.getRealActorFromID(data.target.actorId)) || SR5_EntityHelpers.getRealActorFromID(data.owner.actorId)
  if (!subject) return
  const next = ledgerAfterCast(ledgerWithout(ledger(), isSustained), {
    spellUuid: item.uuid, kind, spellType: item.system.type, threshold: data.roll.hits,
    subjectUuid: subject.uuid, subjectName: subject.name, messageId: message.id,
  })
  await game.settings.set("sr5", ILLUSION_LEDGER, next)
}

async function recordResistance(message, data){
  const observer = SR5_EntityHelpers.getRealActorFromID(data.owner.actorId)
  const spellUuid = data.previousMessage?.itemUuid
  if (!observer || !spellUuid) return
  const result = ledgerAfterResistance(ledger(), spellUuid, observer.uuid, data.roll?.hits)
  if (!result.known) return
  await game.settings.set("sr5", ILLUSION_LEDGER, result.ledger)
  //Only the outcome, to the observer's owners and the GM: the threshold stays with the GM (Q4 of 06/10)
  const spell = globalThis.fromUuidSync?.(spellUuid)
  const whisper = game.users.filter(u => u.isGM || observer.testUserPermission?.(u, "OWNER")).map(u => u.id)
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: observer
    }),
    whisper,
    content: `<p>${game.i18n.format(result.pierced ? "SR5.IllusionPierced" : "SR5.IllusionNotPierced", {
      observer: observer.name, spell: spell?.name ?? ""
    })}</p>`,
  })
}

export function initIllusions(){
  Hooks.on("createChatMessage", (message) => {
    if (!isActiveGM()) return
    const data = message.flags?.sr5data
    const type = data?.test?.type
    let work
    if (type === "spell") work = recordCast(message, data)
    else if (type === "illusionResistance") work = recordResistance(message, data)
    work?.catch(e => SR5_SystemHelpers.srLog(1, `Illusion not recorded: ${e}`))
  })
}

// The blind fire box an attack gets against an invisible target it has not seen through, or null
export function illusionOffer(kinds, roller, targetActor, targetName){
  if (!roller || !targetActor) return null
  const illusions = unpiercedIllusions(ledger(), targetActor.uuid, roller, isSustained)
  return blindFireOffer(illusions, kinds, targetName, game.i18n.localize("SR5.IllusionBlindFire"))
}
