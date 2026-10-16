import {
  describe, expect, it 
} from 'vitest'
import {
  ACCROCHES,
  LIMITE_DESCRIPTION,
  LIMITE_EMBED,
  MAGENTA,
  construireMessage,
  construireMessageModule,
  couper,
  versDiscord,
} from '../.github/actions/annonce-discord/annonce.mjs'

const repo = 'DjamZee/sr5'
const base = 'https://github.com/DjamZee/sr5/releases/download/13.0.0-djamz.13'
const release = (corps, prerelease = true) => ({
  name: '13.0.0-djamz.13',
  tag_name: '13.0.0-djamz.13',
  html_url: 'https://github.com/DjamZee/sr5/releases/tag/13.0.0-djamz.13',
  prerelease,
  body: corps,
  assets: [
    {
      name: 'system.json', browser_download_url: `${base}/system.json` 
    },
    {
      name: 'sr5_13.0.0-djamz.13.zip', browser_download_url: `${base}/sr5_13.0.0-djamz.13.zip` 
    },
    {
      name: 'Rapport.pdf', browser_download_url: `${base}/Rapport.pdf` 
    },
  ],
})

function taille(embed) {
  return embed.title.length + embed.description.length + embed.footer.text.length +
        embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0)
}

describe('annonce Discord', () => {
  it('met les titres et les tableaux à plat', () => {
    const texte = versDiscord('## Modules\n\n| Module | Version |\n|---|---|\n| **Mégapack** | 2.0.18 |')
    expect(texte).toBe('**Modules**\n\n• **Mégapack** · 2.0.18')
  })

  it('recolle les paragraphes coupés à la main, citations et listes comprises', () => {
    const texte = versDiscord('Un paragraphe\ncoupé en deux.\n\n> Une citation\n> sur deux lignes.\n>\n> Suite.\n\n- un point\n  qui continue\n- un autre')
    expect(texte).toBe('Un paragraphe coupé en deux.\n\n> Une citation sur deux lignes.\n>\n> Suite.\n\n- un point qui continue\n- un autre')
  })

  it('coupe à une fin de ligne et renvoie vers GitHub', () => {
    const texte = Array.from({
      length: 50 
    }, (_, i) => `ligne ${i}`).join('\n')
    const coupe = couper(texte, 100, 'https://x')
    expect(coupe.length).toBeLessThanOrEqual(100)
    expect(coupe).toMatch(/ligne \d+\n\n… \[suite sur GitHub\]\(https:\/\/x\)$/)
  })

  it('ferme un bloc de code laissé ouvert par la coupe', () => {
    const coupe = couper('```\n' + 'a\n'.repeat(200) + '```', 80, 'https://x')
    expect((coupe.match(/```/g) ?? []).length % 2).toBe(0)
  })

  it("compose l'embed d'une alpha sous les limites de Discord", () => {
    const message = construireMessage(release('x\n'.repeat(5000)), {
      repo, username: 'Shadow Talker DjamZ' 
    }, () => 0)
    const [embed] = message.embeds
    expect(embed.color).toBe(MAGENTA)
    expect(embed.description.length).toBeLessThanOrEqual(LIMITE_DESCRIPTION)
    expect(taille(embed)).toBeLessThanOrEqual(LIMITE_EMBED)
    expect(embed.description).toContain('— Shadow Talker DjamZ')
    expect(embed.description).toContain('suite sur GitHub')
    expect(embed.fields.map(f => f.name)).toEqual(['📡 Manifeste', '💾 Téléchargement', '📖 Wiki', '📄 Rapport PDF', '⚠️ Alpha'])
    expect(embed.fields[0].value).toContain(`${base}/system.json`)
    expect(message.allowed_mentions).toEqual({
      parse: [] 
    })
  })

  it("n'ajoute pas la mention d'alpha à une version stable", () => {
    const [embed] = construireMessage(release('Notes courtes.', false), {
      repo 
    }).embeds
    expect(embed.fields.some(f => f.name.includes('Alpha'))).toBe(false)
    expect(embed.description).not.toContain('suite sur GitHub')
  })
})

describe('annonce Discord d\'un module (dépôt privé)', () => {
  const dropbox = 'https://www.dropbox.com/scl/fi/abc/module.json?rlkey=x&dl=1'
  const moduleJson = {
    id: 'megapack-sr5-lite',
    title: 'Megapack SR5 Lite - Foundry VTT',
    version: '2.0.18',
    manifest: dropbox,
    download: 'https://www.dropbox.com/scl/fi/def/megapack-sr5-lite.zip?rlkey=y&dl=1',
    relationships: {
      systems: [{
        id: 'sr5', type: 'system', compatibility: {
          minimum: '13.0.0-djamz.13'
        }
      }],
      requires: {
        id: 'sequencer', type: 'module'
      },
      recommends: [{
        id: 'autoanimations', type: 'module'
      }, {
        id: 'foundry-summons', type: 'module', compatibility: {
          minimum: '2.0'
        }
      }],
    },
  }
  const releaseModule = (corps, prerelease = false) => ({
    name: 'v2.0.18',
    tag_name: 'v2.0.18',
    html_url: 'https://github.com/DjamZee/megapack-sr5-lite/releases/tag/v2.0.18',
    prerelease,
    body: corps,
    assets: [{
      name: 'megapack-sr5-lite.zip', browser_download_url: 'https://github.com/DjamZee/megapack-sr5-lite/releases/download/v2.0.18/megapack-sr5-lite.zip'
    }],
  })
  const options = {
    repo: 'DjamZee/megapack-sr5-lite', username: 'Shadow Talker DjamZ'
  }

  it('installe par le manifeste Dropbox, sans aucun lien GitHub', () => {
    const message = construireMessageModule(releaseModule('Notes.'), moduleJson, options, () => 0)
    const [embed] = message.embeds
    expect(embed.title).toBe('Megapack SR5 Lite - Foundry VTT 2.0.18')
    expect(embed.url).toBeUndefined()
    expect(embed.fields.map(f => f.name)).toEqual(['📡 Installation', '🎲 Système requis', '🧩 Dépendances'])
    expect(embed.fields[0].value).toContain(dropbox)
    expect(embed.fields[1].value).toBe('Shadowrun 5 (sr5) ≥ 13.0.0-djamz.13')
    expect(embed.fields[2].value).toBe('**Requis** : sequencer\n**Recommandés** : autoanimations, foundry-summons ≥ 2.0')
    expect(JSON.stringify(message)).not.toMatch(/github\.com/)
    expect(embed.description).toContain('Notes.')
  })

  it('ne parle d\'alpha que pour une prerelease', () => {
    for (let i = 0; i < ACCROCHES.length; i++) {
      const stable = construireMessageModule(releaseModule('x'), moduleJson, options, () => i / ACCROCHES.length)
      expect(JSON.stringify(stable)).not.toMatch(/alpha/i)
    }
    const [embed] = construireMessageModule(releaseModule('x', true), moduleJson, options).embeds
    expect(embed.fields.at(-1).name).toBe('⚠️ Alpha')
  })

  it('coupe les longues notes sans renvoyer vers GitHub et reste sous les limites', () => {
    const [embed] = construireMessageModule(releaseModule('x\n'.repeat(5000)), moduleJson, options).embeds
    expect(embed.description.length).toBeLessThanOrEqual(LIMITE_DESCRIPTION)
    expect(taille(embed)).toBeLessThanOrEqual(LIMITE_EMBED)
    expect(embed.description).toContain('(notes coupées)')
    expect(embed.description).not.toContain('GitHub')
  })

  it('dit « Aucun » sans système ni dépendance, et refuse un module.json sans manifeste', () => {
    const seul = {
      id: 'djamz-journal-tabs', title: 'Onglets de journal', version: '1.0.0', manifest: dropbox
    }
    const [embed] = construireMessageModule(releaseModule(''), seul, options).embeds
    expect(embed.fields[1].value).toBe('Aucun')
    expect(embed.fields[2].value).toBe('Aucune')
    expect(() => construireMessageModule(releaseModule(''), {
      ...seul, manifest: undefined
    }, options)).toThrow(/manifest/)
  })
})
