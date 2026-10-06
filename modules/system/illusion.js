// Invisibility and Mask on the canvas (roll-helpers/illusion.js holds the rules, this file reads Foundry).
// The cast card and the resistance card are their authors' to write: the threshold and who has seen through
// the illusion live in a world setting written by the active GM alone (readable in the console), and the GM
// believes neither the hits written on a card nor who it says rolled: see castVerdict and resistanceVerdict
import {
  SR5_EntityHelpers
} from "../entities/helpers.js"
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  ledgerAfterCast, ledgerAfterResistance, unpiercedIllusions, blindFireOffer,
  illusionResistanceAttributes, resistanceVerdict, castVerdict, messageUsed, ledgerAfterSustain
} from "../rolls/roll-helpers/illusion.js"
import {
  updateLedger
} from "./gm-ledger.js"

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

function owns(user, actor){
  return !!user && !!actor && (user.isGM || actor.testUserPermission?.(user, "OWNER"))
}

function warnGM(key, data){
  return ChatMessage.create({
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
    content: `<p>${game.i18n.format(key, data)}</p>`,
  })
}

// Whether the author of the card had the subject's token targeted (his targets are known to every client)
function targetVerified(author, data){
  if (!data.target?.hasTarget) return true
  return [...(author?.targets ?? [])].some(t => t.actor && (t.id === data.target.actorId || t.actor.id === data.target.actorId))
}

async function recordCast(message, data){
  const item = await fromUuid(data.owner.itemUuid)
  const kind = item?.system?.illusionPierce
  if (!kind) return
  const author = message.author
  const caster = SR5_EntityHelpers.getRealActorFromID(data.owner.actorId, data.actorUuids)
  const verdict = castVerdict({
    authorOwnsCaster: owns(author, caster),
    spellOnCaster: !!caster && (item.parent === caster || item.parent?.id === caster.id),
    messageUsed: messageUsed(ledger(), message.id),
    rollJSON: data.roll?.r, force: data.magic?.force, magic: caster?.system?.specialAttributes?.magic?.augmented?.value,
    claimedHits: data.roll?.hits,
  })
  if (!verdict.ok){
    if (verdict.reason !== "noHits") await warnGM("SR5.IllusionCardRejected", {
      user: author?.name ?? "?", spell: item.name
    })
    return
  }
  //The subject: the targeted token, or the caster himself when he targeted nobody
  const subject = (data.target?.hasTarget && SR5_EntityHelpers.getRealActorFromID(data.target.actorId, data.actorUuids)) || caster
  if (!subject) return
  //Option A of 06/10: every casting of an Invisibility or a Mask is confirmed by the GM, its threshold shown
  const notes = []
  if (verdict.mismatch) notes.push(game.i18n.format("SR5.IllusionConfirmMismatch", {
    claimed: data.roll?.hits ?? "?", hits: verdict.hits
  }))
  if (!targetVerified(author, data)) notes.push(game.i18n.localize("SR5.IllusionConfirmTarget"))
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.IllusionConfirmTitle"
    },
    content: `<p>${game.i18n.format("SR5.IllusionConfirm", {
      user: author?.name ?? "?", caster: caster.name, spell: item.name, subject: subject.name, threshold: verdict.hits
    })}</p>${notes.map(n => `<p><strong>${n}</strong></p>`).join("")}`,
    rejectClose: false,
  })
  if (!ok) return
  await updateLedger(ILLUSION_LEDGER, current => ledgerAfterCast(current, {
    spellUuid: item.uuid, kind, spellType: item.system.type, threshold: verdict.hits,
    subjectUuid: subject.uuid, subjectName: subject.name, messageId: message.id,
  }))
}

// The resistance pool as the GM works it out from the observer himself (rollData-IllusionResistance.js)
function resistancePool(observer, spellType){
  if (observer.type === "actorDrone" || observer.type === "actorDevice") return 15
  return illusionResistanceAttributes(spellType).reduce((sum, key) => sum + (observer.system.attributes?.[key]?.augmented?.value ?? 0), 0)
}

async function recordResistance(message, data){
  const observer = SR5_EntityHelpers.getRealActorFromID(data.owner.actorId, data.actorUuids)
  const spellUuid = data.previousMessage?.itemUuid
  const entry = ledger()[spellUuid]
  if (!observer || !entry) return
  const verdict = resistanceVerdict({
    authorOwnsObserver: owns(message.author, observer), rollJSON: data.roll?.r,
    pool: resistancePool(observer, entry.spellType), edge: observer.system.specialAttributes?.edge?.augmented?.value ?? 0,
  })
  const spell = globalThis.fromUuidSync?.(spellUuid)
  if (!verdict.ok) return warnGM("SR5.IllusionCardRejected", {
    user: message.author?.name ?? "?", spell: spell?.name ?? ""
  })
  let result = null
  await updateLedger(ILLUSION_LEDGER, current => {
    result = ledgerAfterResistance(current, spellUuid, observer.uuid, verdict.hits)
    return result.ledger
  })
  //Only the outcome, to the observer's owners and the GM: the threshold stays with the GM (Q4 of 06/10)
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
  //A spell no longer sustained: its threshold and who had seen through are forgotten. The hands of the sheet write
  //through the actor (baseSheet _onEditItemValue updates its item list), so the actor's update is watched, and a
  //spell cast but not yet sustained is kept until it has been sustained once
  const watch = () => {
    if (!isActiveGM() || !ledgerAfterSustain(ledger(), isSustained)) return
    updateLedger(ILLUSION_LEDGER, current => ledgerAfterSustain(current, isSustained)).catch(e => SR5_SystemHelpers.srLog(1, `Illusion not forgotten: ${e}`))
  }
  Hooks.on("updateActor", watch)
  Hooks.on("updateItem", watch)
  Hooks.on("deleteItem", (item) => {
    if (item.type === "itemSpell" && isActiveGM() && ledger()[item.uuid]) {
      updateLedger(ILLUSION_LEDGER, current => {
        delete current[item.uuid]
        return current
      }).catch(e => SR5_SystemHelpers.srLog(1, `Illusion not forgotten: ${e}`))
    }
  })
}

// The blind fire box an attack gets against an invisible target it has not seen through, or null
export function illusionOffer(kinds, roller, targetActor, targetName){
  if (!roller || !targetActor) return null
  const illusions = unpiercedIllusions(ledger(), targetActor.uuid, roller, isSustained)
  return blindFireOffer(illusions, kinds, targetName, game.i18n.localize("SR5.IllusionBlindFire"))
}
