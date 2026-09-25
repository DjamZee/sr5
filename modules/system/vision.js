// Vision type of the actor (SR5.visionTypes) -> vision mode of the token
export const SR5_TOKEN_VISION_MODES = {
  astral: "astralvision",
  lowLight: "lowLight",
  thermographic: "thermographic",
  ultrasound: "ultrasound",
}

// Vision type of the actor -> world setting holding its range, in scene units
export const SR5_VISION_RANGE_SETTINGS = {
  astral: "sr5VisionRangeAstral",
  lowLight: "sr5VisionRangeLowLight",
  thermographic: "sr5VisionRangeThermographic",
  ultrasound: "sr5VisionRangeUltrasound",
}

// Detection mode carried by a vision type, added on top of the token's basic sight
export const SR5_VISION_DETECTION_MODES = {
  astral: "astralvision",
  ultrasound: "ultrasound",
}

// Colour of the vision cone. The core software uses it as the tint of the whole picture the
// token sees (refreshPrimarySpriteMesh), where it multiplies the scene : a dark colour here
// gives a dull grey view, not a tinted one. These have to stay bright and saturated.
export const SR5_VISION_COLORS = {
  astral: "#303c50",
  lowLight: null,
  thermographic: "#ff7a2a",
  ultrasound: "#bcd8e6",
}

/**
 * Range of a vision type, in scene units. 0 means "only what is lit".
 * @param {string} vision key of SR5.visionTypes
 * @returns {number}
 */
export function getVisionRange(vision) {
  const setting = SR5_VISION_RANGE_SETTINGS[vision]
  if (!setting) return 0
  const range = game.settings.get("sr5", setting)
  return Number.isNumeric(range) ? Math.max(0, Number(range)) : 0
}

/* -------------------------------------------- */
/*  Vision modes                                */
/* -------------------------------------------- */

// Everything below reaches into the canvas classes of the core software, which only exist
// inside a running Foundry : build it on demand rather than when the module is imported.

// Astral perception : SR5 p. 313
function buildAstralVision() {
  const VisionMode = foundry.canvas.perception.VisionMode
  const shaders = foundry.canvas.rendering.shaders
  return new VisionMode({
    id: "astralvision",
    label: "SR5.VISION.ModeAstralvision",
    canvas: {
      shader: shaders.AmplificationSamplerShader,
      uniforms: {
        enable: true, contrast: 0, saturation: -0.5, exposure: -0.25, tint: [0.75, 0.75, 1]
      }
    },
    lighting: {
      background: {
        visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
      },
      illumination: {
        postProcessingModes: ["EXPOSURE"],
        uniforms: {
          exposure: 0.8
        }
      },
      coloration: {
        //postProcessingModes: ["SATURATION", "TINT", "EXPOSURE"], BUG in v11
        uniforms: {
          saturation: -0.75, exposure: 8.0, tint: [0.75, 0.75, 1]
        }
      },
      levels: {
        [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT,
        [VisionMode.LIGHTING_LEVELS.BRIGHT]: VisionMode.LIGHTING_LEVELS.BRIGHTEST
      }
    },
    vision: {
      darkness: {
        adaptive: false
      },
      defaults: {
        attenuation: 0, contrast: 0, saturation: -0.5, brightness: 1
      },
      background: {
        shader: shaders.AmplificationBackgroundVisionShader, uniforms: {
          tint: [0.75, 0.75, 1]
        }
      }
    }
  })
}

/**
 * Definition of the low-light vision mode. Low-light vision sees in dim light as if in full
 * light, but not in total darkness (SR5 p. 176-177, p. 447) : the book asks for nothing more
 * than the lighting level it raises, so that is all the mode does by default.
 *
 * No exposure and no desaturation on the lighting layers : on a scene lit by its global light,
 * those drew the whole scene brighter than full daylight and washed out (measured : mean
 * luminance 79 against 67 in daylight, saturation 79 against 108).
 *
 * The green tint is a convention of night-vision goggles, not a rule : a world setting. It
 * needs the lighting background layer switched off, otherwise the lit areas are drawn from the
 * untinted picture and the green only shows where no light falls (the core software's own
 * Light Amplification mode loses it the same way).
 * @param {boolean} greenTint
 * @param {object} VisionMode    foundry.canvas.perception.VisionMode, or its constants
 * @param {object} shaders       foundry.canvas.rendering.shaders
 * @returns {object}
 */
export function getLowLightVisionData(greenTint, VisionMode, shaders) {
  const data = {
    id: "lowLight",
    label: "SR5.LowLightVision",
    lighting: {
      levels: {
        [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT
      }
    },
    vision: {
      darkness: {
        adaptive: false
      },
      defaults: {
        attenuation: 0, contrast: 0, saturation: 0, brightness: 0
      }
    }
  }
  if (!greenTint) return data
  // The tint itself comes from the shaders' default colour, unless the token has a vision colour
  data.canvas = {
    shader: shaders.AmplificationSamplerShader
  }
  data.lighting.background = {
    visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
  }
  data.vision.background = {
    shader: shaders.AmplificationBackgroundVisionShader
  }
  return data
}

function buildLowLightVision() {
  const VisionMode = foundry.canvas.perception.VisionMode
  const greenTint = game.settings.get("sr5", "sr5LowLightGreenTint")
  return new VisionMode(getLowLightVisionData(greenTint, VisionMode, foundry.canvas.rendering.shaders))
}

// Thermographic vision : sees heat, so it works in the dark and through most smoke (SR5 p. 176)
function buildThermographicVision() {
  const VisionMode = foundry.canvas.perception.VisionMode
  const shaders = foundry.canvas.rendering.shaders
  return new VisionMode({
    id: "thermographic",
    label: "SR5.ThermographicVision",
    canvas: {
      // The amplification shader REPLACES the picture by its tinted luminance, which is what
      // reads as a heat picture. The colour adjustment shader only multiplies by the tint, and
      // on a sand-coloured map that just looks like the same map, slightly darker.
      shader: shaders.AmplificationSamplerShader,
      uniforms: {
        enable: true, contrast: 0.6, saturation: -1, exposure: -0.6, tint: [1, 0.48, 0.16]
      }
    },
    lighting: {
      background: {
        visibility: VisionMode.LIGHTING_VISIBILITY.REQUIRED,
        postProcessingModes: ["SATURATION", "EXPOSURE"],
        uniforms: {
          saturation: -1, exposure: 0, tint: [1, 0.48, 0.16]
        }
      },
      illumination:{
        postProcessingModes: ["SATURATION"],
        uniforms: {
          saturation: -1
        }
      },
      coloration: {
        postProcessingModes: ["SATURATION", "EXPOSURE"],
        uniforms: {
          saturation: -1, exposure: 0, tint: [1, 0.48, 0.16]
        }
      },
      levels:{
        [VisionMode.LIGHTING_LEVELS.DIM]: VisionMode.LIGHTING_LEVELS.BRIGHT
      }
    },
    vision: {
      darkness: {
        adaptive: false
      },
      defaults: {
        attenuation: 0, contrast: 0.6, saturation: -1, brightness: -0.2
      },
      background: {
        shader: shaders.AmplificationBackgroundVisionShader, uniforms: {
          tint: [1, 0.48, 0.16]
        }
      }
    }
  })
}

// Ultrasound : a sound picture, blind to colour and light, stopped by walls (SR5 p. 449)
function buildUltrasoundVision() {
  const VisionMode = foundry.canvas.perception.VisionMode
  const shaders = foundry.canvas.rendering.shaders
  return new VisionMode({
    id: "ultrasound",
    label: "SR5.UltrasoundVision",
    canvas: {
      shader: shaders.ColorAdjustmentsSamplerShader,
      uniforms: {
        contrast: 0.2, saturation: -1, exposure: -0.3
      }
    },
    lighting: {
      background: {
        visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
      },
      illumination: {
        visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
      },
      coloration: {
        visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
      },
      darkness: {
        visibility: VisionMode.LIGHTING_VISIBILITY.DISABLED
      }
    },
    vision: {
      darkness: {
        adaptive: false
      },
      defaults: {
        attenuation: 0, contrast: 0.2, saturation: -1, brightness: 0.8
      },
      background: {
        shader: shaders.WaveBackgroundVisionShader
      },
      coloration: {
        shader: shaders.WaveColorationVisionShader
      }
    }
  }, {
    animated: true
  })
}

/* -------------------------------------------- */
/*  Detection modes                             */
/* -------------------------------------------- */

function buildDetectionModes() {
  const DetectionMode = foundry.canvas.perception.DetectionMode
  const DetectionModeDarkvision = foundry.canvas.perception.DetectionModeDarkvision
  const DetectionModeInvisibility = foundry.canvas.perception.DetectionModeInvisibility
  const GlowOverlayFilter = foundry.canvas.rendering.filters.GlowOverlayFilter

  class DetectionModeBasicSightSR extends DetectionModeDarkvision {
    constructor(){
      super({
        id: "basicSight",
        label: "DETECTION.BasicSight",
        type: DetectionMode.DETECTION_TYPES.SIGHT
      })
    }

    /** @override */
    _canDetect(visionSource, target) {
      let detected = super._canDetect(visionSource, target)
      const tgt = target?.document
      if ((tgt instanceof foundry.documents.TokenDocument)) {
        //check if target has astral effect and hide it if true;
        detected = tgt.actor?.effects?.find(e => e.statuses.has("astralInit"))
        return !detected
      } else return true
    }
  }

  class DetectionModeAstral extends DetectionMode {
    constructor(){
      super({
        id: "astralvision",
        label: "SR5.VISION.ModeAstralvision",
        //tokenConfig: false,
        walls: true,
        type: DetectionMode.DETECTION_TYPES.OTHER
      })
    }

    _canDetect(_visionSource, _target) {
      return true
    }

    /** @override */
    static getDetectionFilter() {
      return this._detectionFilter ??= GlowOverlayFilter.create({
        glowColor: [0, 0.57, 0.99, 1],
        distance: 10,
      })
    }
  }

  // Ultrasound paints a sound picture of what optics cannot see : it reveals someone hidden
  // by an Invisibility spell, but it stops at walls (SR5 p. 449).
  class DetectionModeUltrasound extends DetectionModeInvisibility {
    constructor(){
      super({
        id: "ultrasound",
        label: "SR5.UltrasoundVision",
        walls: true,
        angle: true,
        type: DetectionMode.DETECTION_TYPES.OTHER
      })
    }

    /** @override */
    static getDetectionFilter() {
      return this._detectionFilter ??= GlowOverlayFilter.create({
        glowColor: [0.4, 0.75, 0.9, 1],
        distance: 10,
      })
    }
  }

  return {
    astralvision: new DetectionModeAstral(),
    basicSight: new DetectionModeBasicSightSR(),
    ultrasound: new DetectionModeUltrasound(),
  }
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

/**
 * Replace the vision and detection modes of the core software by those of Shadowrun.
 * Called once at init.
 */
export function registerVisionModes() {
  const modes = CONFIG.Canvas.visionModes
  // Vision modes that have no meaning in Shadowrun are removed from the token configuration
  for (const id of ["darkvision", "monochromatic", "tremorsense", "lightAmplification"]) delete modes[id]
  // Normal metahuman sight
  if (modes.basic) modes.basic.label = "SR5.VISION.ModeNatural"
  modes.lowLight = buildLowLightVision()
  modes.thermographic = buildThermographicVision()
  modes.ultrasound = buildUltrasoundVision()
  modes.astralvision = buildAstralVision()

  const detection = CONFIG.Canvas.detectionModes
  Object.assign(detection, buildDetectionModes())
  // Detection modes of the core software that no Shadowrun vision uses
  for (const id of ["seeInvisibility", "senseInvisibility", "feelTremor"]) {
    if (detection[id]) detection[id].updateSource({
      tokenConfig: false
    })
  }
}
