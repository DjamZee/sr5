// Resizable sheets (rapport de Jack, 2026-10-05; choix d'interface tranchés par Élise) : a sheet can
// be resized in width and height, never below its default size, and the size chosen is kept per
// sheet type and per computer (a hidden client setting), without writing into the documents.
export const SHEET_SIZE_SETTING = "sheetSizes"

export function registerSheetSizeSetting() {
  game.settings.register("sr5", SHEET_SIZE_SETTING, {
    scope: "client", config: false, type: Object, default: {
    },
  })
}

/** "Actor.actorPc", "Item.itemWeapon"... */
export function sheetSizeKey(document) {
  return `${document?.documentName}.${document?.type}`
}

/** The default size of a sheet class is also its minimum size. */
export function minSheetSize(sheetClass) {
  const {
    width, height 
  } = sheetClass.DEFAULT_OPTIONS?.position ?? {
  }
  return {
    width, height 
  }
}

/** Raises each numeric dimension of `size` to its minimum; leaves anything else untouched. */
export function clampSheetSize(size, min) {
  const clamped = {
  }
  for (const dim of ["width", "height"]) {
    const value = size?.[dim]
    if (typeof value !== "number") continue
    clamped[dim] = typeof min?.[dim] === "number" ? Math.max(value, min[dim]) : value
  }
  return clamped
}

export function rememberedSheetSize(document, min) {
  const sizes = game.settings.get("sr5", SHEET_SIZE_SETTING) ?? {
  }
  return clampSheetSize(sizes[sheetSizeKey(document)], min)
}

const pending = new Map()
export function rememberSheetSize(document, {
  width, height 
}, min = {
}) {
  if (typeof width !== "number" || typeof height !== "number") return
  // Never a size below the floor (a minimized window is a 36px-high strip)
  if (width < (min.width ?? 0) || height < (min.height ?? 0)) return
  const key = sheetSizeKey(document)
  clearTimeout(pending.get(key))
  // A resize drag fires many times: only the last size is written
  pending.set(key, setTimeout(() => {
    pending.delete(key)
    const sizes = foundry.utils.deepClone(game.settings.get("sr5", SHEET_SIZE_SETTING) ?? {
    })
    const old = sizes[key]
    if (old?.width === width && old?.height === height) return
    // Opening a sheet at its default size is not a choice worth writing
    if (!old && width === min.width && height === min.height) return
    sizes[key] = {
      width, height 
    }
    game.settings.set("sr5", SHEET_SIZE_SETTING, sizes)
  }, 500))
}

/** Shared by the actor and item base sheets. */
export function sheetSizeOptions(sheetClass, options) {
  options.position = {
    ...options.position, ...rememberedSheetSize(options.document, minSheetSize(sheetClass)) 
  }
  return options
}

export function sheetSizeSetPosition(app, position, setPosition) {
  // A minimized window (dragged around, then restored) is neither clamped nor remembered
  if (app.minimized) return setPosition(position)
  const min = minSheetSize(app.constructor)
  if (position) Object.assign(position, clampSheetSize(position, min))
  const result = setPosition(position)
  if (position && ("width" in position || "height" in position)) rememberSheetSize(app.document, result ?? app.position, min)
  return result
}
