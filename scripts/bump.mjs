#!/usr/bin/env node
/**
 * Decide the next version from commit messages on stdin (NUL-separated) and
 * stamp it into the manifests. Prints the new version to stdout; writes the tag
 * message to --notes-file. Exits 3 when no commit in the range warrants a
 * release, which version.sh reports as "nothing to release".
 *
 * All the logic worth testing lives in ./semver.mjs and ./manifests.mjs — this
 * file is the seam between those pure functions and the filesystem.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { decideBump, nextVersion, groupCommits } from './semver.mjs'
import { setJsonVersion, setTomlVersion, setLockVersion } from './manifests.mjs'

const NOTHING_TO_RELEASE = 3

function parseArgs(argv) {
  const opts = { root: process.cwd(), dryRun: false, releaseAs: null, notesFile: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--root') opts.root = argv[++i]
    else if (arg === '--release-as') opts.releaseAs = argv[++i]
    else if (arg === '--notes-file') opts.notesFile = argv[++i]
    else die(`Unknown argument: ${arg}`)
  }
  return opts
}

function die(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function readStdin() {
  const raw = existsSync('/dev/stdin') ? readFileSync(0, 'utf8') : ''
  return raw.split('\0').map((m) => m.trim()).filter(Boolean)
}

const opts = parseArgs(process.argv.slice(2))
const messages = readStdin()

const tauriConf = join(opts.root, 'src-tauri/tauri.conf.json')
if (!existsSync(tauriConf)) die(`Not a translucent-todo checkout: ${tauriConf} is missing`)
const current = JSON.parse(readFileSync(tauriConf, 'utf8')).version

let version
if (opts.releaseAs) {
  if (!/^\d+\.\d+\.\d+$/.test(opts.releaseAs)) die(`--release-as expects MAJOR.MINOR.PATCH, got "${opts.releaseAs}"`)
  version = opts.releaseAs
} else {
  const bump = decideBump(messages)
  if (!bump) process.exit(NOTHING_TO_RELEASE)
  version = nextVersion(current, bump)
}

if (opts.notesFile) {
  const notes = groupCommits(messages)
  writeFileSync(opts.notesFile, `v${version}\n\n${notes || 'No release-relevant commits.'}\n`)
}

if (!opts.dryRun) {
  // Every manifest that carries this version. Optional ones are skipped when
  // absent; the required pair is not, so the copies cannot drift.
  const edits = [
    ['package.json', setJsonVersion, true],
    ['src-tauri/tauri.conf.json', setJsonVersion, true],
    ['src-tauri/Cargo.toml', setTomlVersion, false],
    ['src-tauri/Cargo.lock', (text, v) => setLockVersion(text, 'app', v), false],
  ]
  for (const [relative, transform, required] of edits) {
    const path = join(opts.root, relative)
    if (!existsSync(path)) {
      if (required) die(`Cannot release: ${relative} is missing`)
      continue
    }
    try {
      writeFileSync(path, transform(readFileSync(path, 'utf8'), version))
    } catch (e) {
      die(`${relative}: ${e.message}`)
    }
  }
}

process.stdout.write(`${version}\n`)
