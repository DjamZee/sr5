// The RP-Tac network on the canvas (roll-helpers/tacnet.js holds the rules, this file reads Foundry).
// The roster lives in a hidden world setting written by the active GM alone: the bearer of the unit asks,
// the GM confirms (decided on 06/10). The combat skill of the combat mode is each member's own pick, on his actor
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  SR5_SocketHandler
} from "../socket.js"
import {
  tacnetLevel, tacnetMembers, tacnetCapacity, ledgerAfterJoin, ledgerAfterLeave, tacnetBonus, tacnetOffer
} from "../rolls/roll-helpers/tacnet.js"

export const TACNET_LEDGER = "sr5TacnetLedger"
export const TACNET_COMBAT_FLAG = "tacnetCombatSkill"

export function registerTacnetSetting(){
  game.settings.register("sr5", TACNET_LEDGER, {
    scope: "world",
    config: false,
    type: Object,
    default: {
    },
  })
}

function ledger(){
  try {
    return game.settings.get("sr5", TACNET_LEDGER) ?? {
    }
  } catch {
    return {
    }
  }
}

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

// An actor of a targeted token, by the uuid its rolls will carry (an unlinked token has its own)
export function tokenActorUuid(token){
  return token?.actor?.uuid ?? null
}

// The network of one RP-Tac unit: switched on with its wireless on, its bearer and the GM's roster
export function tacnetNetwork(item, roster = ledger()){
  const bearer = item.parent
  return {
    uuid: item.uuid, name: item.name, level: tacnetLevel(item.system.tacnetLevel), rating: item.system.deviceRating,
    active: !!(item.system.isActive && item.system.wirelessTurnedOn),
    bearerUuid: bearer?.uuid ?? null, members: tacnetMembers(roster, item.uuid, bearer?.uuid ?? null),
  }
}

// Every RP-Tac unit the roller may be reached by: the world's actors and the scene's unlinked tokens
function networks(){
  const roster = ledger()
  const actors = new Set(game.actors?.contents ?? [])
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) if (t.actor) actors.add(t.actor)
  const found = []
  for (const actor of actors){
    for (const item of actor.items ?? []){
      if (item.type === "itemGear" && tacnetLevel(item.system.tacnetLevel)) found.push(tacnetNetwork(item, roster))
    }
  }
  return found
}

// What a prepared roll is, for the network: its skill, or a knowledge skill's name
function rollSkill(rollData){
  const type = rollData.test?.type
  if (type === "skillDicePool" || type === "skill") return {
    skill: rollData.test.typeSub
  }
  const item = rollData.owner?.itemUuid ? globalThis.fromUuidSync?.(rollData.owner.itemUuid) : null
  if (type === "attack") return {
    skill: item?.system?.weaponSkill?.category
  }
  if (type === "knowledgeSkill") return {
    knowledgeName: item?.name
  }
  return {
  }
}

export function tacnetOfferFor(rollData, actor){
  if (!actor) return null
  const bonus = tacnetBonus(networks(), actor.uuid, {
    ...rollSkill(rollData), combatChoice: actor.getFlag?.("sr5", TACNET_COMBAT_FLAG)
  })
  if (!bonus) return null
  return tacnetOffer(bonus, game.i18n.format("SR5.TacnetBonus", {
    name: bonus.name, level: bonus.level
  }))
}

// The roster as the GM writes it; the error said to whoever asked
async function applyRoster({
  deviceUuid, memberUuid, action
}, requesterId){
  const item = await fromUuid(deviceUuid)
  if (!item || !tacnetLevel(item.system.tacnetLevel)) return
  const member = await fromUuid(memberUuid)
  let next, error = null
  if (action === "leave") next = ledgerAfterLeave(ledger(), deviceUuid, memberUuid)
  else ({
    ledger: next, error
  } = ledgerAfterJoin(ledger(), deviceUuid, memberUuid, {
    deviceRating: item.system.deviceRating, bearerUuid: item.parent?.uuid
  }))
  const say = (key) => {
    const text = game.i18n.format(key, {
      member: member?.name ?? memberUuid, network: item.name, max: tacnetCapacity(item.system.deviceRating)
    })
    if (!requesterId || requesterId === game.user.id) return ui.notifications.info(text)
    ChatMessage.create({
      whisper: [requesterId, game.user.id], content: `<p>${text}</p>`
    })
  }
  if (error) return say(error === "full" ? "SR5.TacnetFull" : "SR5.TacnetAlready")
  await game.settings.set("sr5", TACNET_LEDGER, next)
  say(action === "leave" ? "SR5.TacnetLeft" : "SR5.TacnetJoined")
}

// The bearer asks, the active GM confirms; the GM himself writes at once
export async function requestRoster(item, memberUuid, action){
  const data = {
    deviceUuid: item.uuid, memberUuid, action
  }
  if (isActiveGM()) return applyRoster(data)
  await SR5_SocketHandler.emitForGM("tacnetRoster", data)
}

export async function _socketTacnetRoster(message, senderId){
  if (!game.user.isGM) return
  const data = message.data
  const item = await fromUuid(data.deviceUuid)
  const member = await fromUuid(data.memberUuid)
  const sender = game.users.get(senderId)
  //Only the owner of the unit may ask
  if (!item || !sender || !item.testUserPermission?.(sender, "OWNER")) return
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "SR5.TacnetTitle"
    },
    content: `<p>${game.i18n.format(data.action === "leave" ? "SR5.TacnetAskLeave" : "SR5.TacnetAskJoin", {
      user: sender.name, member: member?.name ?? data.memberUuid, network: item.name
    })}</p>`,
    rejectClose: false,
  })
  if (!ok) return ChatMessage.create({
    whisper: [senderId, game.user.id], content: `<p>${game.i18n.format("SR5.TacnetRefused", {
      member: member?.name ?? "", network: item.name
    })}</p>`
  })
  await applyRoster(data, senderId).catch(e => SR5_SystemHelpers.srLog(1, `Tacnet roster not written: ${e}`))
}

// What the sheet shows: the members by name, the places left (read-only for all, Q10 of 06/10)
export function tacnetSheetContext(item){
  const net = tacnetNetwork(item)
  return {
    level: net.level, capacity: tacnetCapacity(net.rating), free: Math.max(0, tacnetCapacity(net.rating) - net.members.length),
    active: net.active,
    members: net.members.map(uuid => ({
      uuid, name: globalThis.fromUuidSync?.(uuid)?.name ?? uuid, isBearer: uuid === net.bearerUuid
    })),
  }
}
