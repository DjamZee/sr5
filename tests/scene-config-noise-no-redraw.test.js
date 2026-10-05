import {
  describe, it, expect, vi
} from "vitest"

// Measured in play on 05/10: choosing a phenomenon saved the noise at once (setFlag), which redrew the
// scene sheet and lost the count and alignment it had just filled. A field change now only shows the
// noise; it is saved with the form.
globalThis.foundry ??= {
}
foundry.applications ??= {
}
foundry.applications.sheets ??= {
}
foundry.applications.sheets.SceneConfig ??= class {
  static PARTS = {
  }
  static TABS = {
    sheet: {
      tabs: []
    }, ambience: {
    }
  }
  _prepareSubmitData() {
    return {
    }
  }
}
foundry.utils ??= {
}
foundry.utils.setProperty ??= (obj, path, value) => {
  const keys = path.split(".")
  let o = obj
  for (const k of keys.slice(0, -1)) o = o[k] ??= {
  }
  o[keys.at(-1)] = value
}

const {
  default: SR5SceneConfig
} = await import("../modules/interface/sceneConfig.js")

const makeForm = (values) => ({
  querySelector: (sel) => {
    const name = /name="([^"]+)"/.exec(sel)?.[1]
    if (name === "sceneNoiseRating") return {
      value: 0
    }
    const key = name?.replace("flags.sr5.", "")
    return key in values ? {
      value: values[key]
    } : null
  }
})

describe("scene sheet, noise of a phenomenon", () => {
  const makeSheet = () => {
    const sheet = Object.create(SR5SceneConfig.prototype)
    Object.defineProperty(sheet, "document", {
      value: {
        flags: {
          sr5: {
            matrixNoise: 0
          }
        }, setFlag: vi.fn()
      }
    })
    return sheet
  }

  it("does not save the noise on a field change", () => {
    const sheet = makeSheet()
    sheet.updateMatrixNoise(makeForm({
      backgroundCountPhenomenon: "theMist", backgroundCountValue: "6"
    }))
    expect(sheet.document.setFlag).not.toHaveBeenCalled()
  })

  it("saves the Mist's Force as noise with the form", () => {
    const sheet = makeSheet()
    const data = sheet._prepareSubmitData(null, makeForm({
      matrixSpam: "1", backgroundCountPhenomenon: "theMist", backgroundCountValue: "6"
    }))
    expect(data.flags.sr5.matrixNoise).toBe(7)
  })
})
