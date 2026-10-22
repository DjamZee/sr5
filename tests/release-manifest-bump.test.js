import {
  describe, it, expect
} from 'vitest'
import {
  createRequire
} from 'node:module'
import fs from 'node:fs'

// Gédéon, D3: npm run release rewrote "version" only. A 13.1.1 published with "download" left on v13.1.0: Foundry saw
// 13.1.1, fetched the 13.1.0 zip, then offered the update again at every launch. And the tag had no "v" (13.1.1), when
// the public one is v13.1.0.
const {
  bumpManifest, tagOf
} = createRequire(import.meta.url)('../scripts/release.js')

describe('npm run release: the manifest', () => {
  it('sets the version and the tag of the download together, the rest untouched', () => {
    const before = fs.readFileSync(new URL('../system.json', import.meta.url), 'utf8')
    const after = JSON.parse(bumpManifest(before, '13.2.0'))
    const was = JSON.parse(before)
    expect(after.version).toBe('13.2.0')
    expect(after.download).toBe('https://github.com/DjamZee/sr5-unofficial/releases/download/v13.2.0/sr5.zip')
    expect(after.manifest).toBe(was.manifest)
    expect({
      ...after, version: was.version, download: was.download
    }).toEqual(was)
  })
  it('tags in one form, with a "v"', () => expect(tagOf('13.1.1')).toBe('v13.1.1'))
  it('refuses a manifest whose download is not a release address', () => {
    expect(() => bumpManifest('{"version": "1.0.0", "download": "https://example.org/sr5.zip"}', '1.0.1')).toThrow()
  })
})
