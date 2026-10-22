// The Lite of the Megapack inside the system (arbitrage de DjamZ, 23/10, for the 1.0): its four packs are built
// outside Git from the full Megapack's sources by its tools/build-lite.py (--cible systeme), and checked by its
// tools/verify-lite.mjs. Shared by build-megapack.js and verify-megapack.js: where the full Megapack is, and which
// packs of system.json it builds.

const {
  execFileSync,
} = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const BUILD_FLAG = 'megapack'

/** The packs of system.json built by build:megapack (flags.sr5.build = megapack). */
function megapackPacks(root = ROOT) {
  const system = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8').replace(/^\uFEFF/, ''))
  return (system.packs ?? []).filter(p => p.flags?.sr5?.build === BUILD_FLAG)
}

/** What the last build recorded (megapack/BUILD.json), or null. */
function lastBuild(root = ROOT) {
  const file = path.join(root, 'megapack', 'BUILD.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

/**
 * The full Megapack's repository: --complet, else SR5_MEGAPACK_COMPLET, else the one of the last build if it is still
 * there, else beside the main checkout of the system (…\Shadowrun 5 - Megapack\megapack-sr5-foundry-vtt).
 */
function completRepo(argv = process.argv, root = ROOT) {
  const i = argv.indexOf('--complet')
  const candidates = [i > 0 ? argv[i + 1] : null, process.env.SR5_MEGAPACK_COMPLET, lastBuild(root)?.complet]
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root, encoding: 'utf8',
    }).trim()
    candidates.push(path.resolve(path.dirname(common), '..', '..', 'Shadowrun 5 - Megapack', 'megapack-sr5-foundry-vtt'))
  } catch {
    // not a Git checkout: only the explicit candidates
  }
  return candidates.find(dir => dir && fs.existsSync(path.join(dir, 'tools', 'build-lite.py'))) ?? null
}

/** The commit a repository is at, or null. */
function headOf(repo) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo, encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

/**
 * Whether the full Megapack still holds what the copy was built from: the same trees for each path it reads (a commit
 * of its tools alone changes nothing) and nothing modified in them.
 */
function sameSources(repo, build) {
  const paths = Object.keys(build?.sources ?? {
  })
  if (!paths.length) return false
  const git = args => {
    try {
      return execFileSync('git', args, {
        cwd: repo, encoding: 'utf8',
      }).trim()
    } catch {
      return null
    }
  }
  return paths.every(p => git(['rev-parse', `HEAD:${p}`]) === build.sources[p]) &&
    git(['status', '--porcelain', '--', ...paths]) === ''
}

module.exports = {
  ROOT, BUILD_FLAG, megapackPacks, lastBuild, completRepo, headOf, sameSources,
}
