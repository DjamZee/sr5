import {
  SR5Combat 
} from "./system/srcombat.js"
import {
  SR5_SystemHelpers 
} from "./system/utilitySystem.js"
import {
  SR5Actor 
} from "./entities/actors/entityActor.js"
import {
  SR5_RollMessage 
} from "./rolls/roll-message.js"
import {
  SR5_MarkHelpers 
} from "./rolls/roll-helpers/mark.js"
import {
  SR5_MiscellaneousHelpers 
} from "./rolls/roll-helpers/miscellaneous.js"
import {
  SR5_ActorHelper 
} from "./entities/actors/entityActor-helpers.js"
import {
  sr5SocketTablePayout
} from "./interface/table-payout.js"
import {
  SR5ShopFence
} from "./interface/shop-fence.js"
import {
  SR5_GrappleHelpers
} from "./rolls/roll-helpers/grapple.js"
import {
  SR5SharedVision
} from "./interface/shared-vision.js"
import {
  SR5StorageLock
} from "./interface/storage-lock-actions.js"
// The gamemaster's vendor is loaded when one of its messages comes in: the socket is imported by
// half the system, and the shop brings the other half (lot C)
const vendor = method => async (message, senderId) => {
  const {
    SR5ShopVendor
  } = await import("./interface/shop-vendor.js")
  return SR5ShopVendor[method](message, senderId)
}

export class SR5_SocketHandler {
  static registerSocketListeners() {
    const hooks = {
      "doNextRound": [SR5Combat._socketDoNextRound],
      "doInitPass": [SR5Combat._socketDoInitPass],
      "updateCombat": [SR5Combat._socketUpdateCombat],
      "changeInitInCombat": [SR5Combat._socketChangeInitInCombat],
      "createSidekick": [SR5_ActorHelper._socketCreateSidekick],
      "createDeadEffect": [SR5_ActorHelper._socketCreateDeadEffect],
      "dismissSidekick": [SR5_ActorHelper._socketDismissSidekick],
      "addItemToPan": [SR5_ActorHelper._socketAddItemToPan],
      "deleteItemFromPan": [SR5_ActorHelper._socketDeleteItemFromPan],
      "deleteMarksOnActor": [SR5_ActorHelper._socketDeleteMarksOnActor],
      "deleteMarkInfo": [SR5_ActorHelper._socketDeleteMarkInfo],
      "updateDeckMarkedItems": [SR5_MarkHelpers._socketUpdateDeckMarkedItems],
      "markPanMaster": [SR5_MarkHelpers._socketMarkPanMaster],
      "markSlavedDevice": [SR5_MarkHelpers._socketMarkSlavedDevice],
      "markItem": [SR5_MarkHelpers._socketMarkItem],
      "eraseMark": [SR5_MarkHelpers._socketEraseMark],
      "overwatchIncrease": [SR5_ActorHelper._socketOverwatchIncrease],
      "linkEffectToSource": [SR5_ActorHelper._socketLinkEffectToSource],
      "deleteSustainedEffect": [SR5_ActorHelper._socketDeleteSustainedEffect],
      "deleteItem": [SR5_MiscellaneousHelpers._socketDeleteItem],
      "updateItem": [SR5_MiscellaneousHelpers._socketUpdateItem],
      "createItemEffect": [SR5_MiscellaneousHelpers._socketCreateItemEffect],
      "updateChatButton": [SR5_RollMessage._socketUpdateChatButton],
      "updateRollCard": [SR5_RollMessage._socketUpdateRollCard],
      "heal": [SR5_ActorHelper._socketHeal],
      "updateActorData": [SR5_MiscellaneousHelpers._socketUpdateActorData],
      "takeDamage":[SR5_ActorHelper._socketTakeDamage],
      "actorRoll": [SR5Actor._socketRollTest],
      "tablePayout": [sr5SocketTablePayout],
      "shopFenceCash": [SR5ShopFence.socketCash],
      "grappleStartHold": [SR5_GrappleHelpers._socketStartHold],
      "grappleReleaseHold": [SR5_GrappleHelpers._socketReleaseHold],
      "grappleSetHold": [SR5_GrappleHelpers._socketSetHold],
      "grappleWarn": [SR5_GrappleHelpers._socketWarn],
      "grappleReverseHold": [SR5_GrappleHelpers._socketReverseHold],
      "sharedVisionSetViewer": [SR5SharedVision._socketSetViewer],
      "storageLockPick": [SR5StorageLock._socketPick],
      "shopVendorBuy": [vendor('_socketBuy')],
      "shopVendorNotice": [vendor('_socketNotice')],
      "shopVendorOffer": [vendor('_socketOffer')],
      "shopVendorAccept": [vendor('_socketAccept')],
      "shopVendorDecline": [vendor('_socketDecline')],
    }

    //senderId is added by the server to every custom socket message: a client cannot forge it
    game.socket.on(`system.sr5`, async (message, senderId) => {
      SR5_SystemHelpers.srLog(3,'Received Shadowrun 5 system socket message.', message)
      const handlers = hooks[message.type]
      if (!handlers || handlers.length === 0) return console.warn('System socket message without handler!', message)
      if (message.userId && game.user.id !== message.userId) return
      if (message.userId && game.user.id) SR5_SystemHelpers.srLog(3,'GM is handling Shadowrun 5 system socket message')

      for (const handler of handlers) {
        await handler(message, senderId)
      }
    })
  }

  static _createMessage(type, data, userId) {
    return {
      type, data, userId
    }
  }

  static async emit(type, data) {
    const message = SR5_SocketHandler._createMessage(type, data)
    await game.socket.emit(`system.sr5`, message)
  }

  static async emitForGM(type, data) {
    if (game.user.isGM) return SR5_SystemHelpers.srLog(1, 'Active user is GM, abort')

    const gmUser = game.users.find(user => user.isGM && user.active)
    //Nobody can relay the action: say so instead of dropping it silently
    if (!gmUser) {
      ui.notifications.warn(game.i18n.localize("SR5.WARN_NoActiveGM"))
      return SR5_SystemHelpers.srLog(1, 'No active GM user!')
    }

    const message = SR5_SocketHandler._createMessage(type, data, gmUser.id)
    await game.socket.emit(`system.sr5`, message)
  }

  static async emitForPlayer(type, data, playerId) {
    const message = SR5_SocketHandler._createMessage(type, data, playerId)
    await game.socket.emit(`system.sr5`, message)
  }
}
