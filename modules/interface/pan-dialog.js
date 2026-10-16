import {
  SR5_EntityHelpers 
} from "../entities/helpers.js"

export default class SR5_PanDialog {

  static async create({
    title, content, data
  }) {
    let dialogData = {
      ...data
    }

    return foundry.applications.api.DialogV2.wait({
      window: {
        title 
      },
      content,
      buttons: [
        {
          action: "ok",
          label: "Ok",
          default: true,
          callback: (event, button, dialog) => ({
            action: "ok", element: dialog.element 
          }),
        },
        {
          action: "cancel",
          label: game.i18n.localize("SR5.Cancel"),
          callback: () => ({
            action: "cancel" 
          }),
        },
      ],
      rejectClose: false,
      render: (event, dialog) => {
        const element = dialog.element
        // Use event delegation so listener persists across content updates
        element.addEventListener("change", async ev => {
          if (ev.target.name !== "actor" && ev.target.name !== "showAll") return
          ev.preventDefault()
          if (ev.target.name === "actor") {
            let actor = SR5_EntityHelpers.getRealActorFromID(ev.target.value)
            //An unlinked token keeps its token's id, the one its entry carries (S1)
            dialogData = {
              ...dialogData,
              actor: ev.target.value,
              list: actor.system.matrix.potentialPanObject,
            }
          } else {
            //S1: "show everyone" swaps the actors of the scene for those of the world
            const showAll = ev.target.checked
            dialogData = {
              ...dialogData,
              showAll,
              actorList: (showAll ? dialogData.actorListAll : dialogData.actorListScene) ?? dialogData.actorList,
            }
          }
          const newContent = await foundry.applications.handlebars.renderTemplate(
            "systems/sr5/templates/interface/addItemToPan.hbs", dialogData
          )
          const contentDiv = element.querySelector('.dialog-content')
          if (contentDiv) contentDiv.innerHTML = newContent
        })
      },
    })
  }

}
