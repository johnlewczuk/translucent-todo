import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))

let repo, bin

/**
 * Stub npm and sudo onto the front of PATH so the wrappers can be tested
 * without a five-minute Rust build or a root password. Each stub appends its
 * arguments to a log the test reads back; the npm stub also produces the .deb
 * a real `tauri build` would leave behind.
 */
function stubBin(dir) {
  const binDir = join(dir, 'bin')
  mkdirSync(binDir)
  const npm = `#!/usr/bin/env bash
echo "npm $*" >> "${dir}/calls.log"
version=$(grep -o '"version": "[^"]*"' "${dir}/src-tauri/tauri.conf.json" | head -1 | cut -d'"' -f4)
mkdir -p "${dir}/src-tauri/target/release/bundle/deb"
touch "${dir}/src-tauri/target/release/bundle/deb/translucent-todo_\${version}_amd64.deb"
`
  const sudo = `#!/usr/bin/env bash
echo "sudo $*" >> "${dir}/calls.log"
`
  writeFileSync(join(binDir, 'npm'), npm)
  writeFileSync(join(binDir, 'sudo'), sudo)
  chmodSync(join(binDir, 'npm'), 0o755)
  chmodSync(join(binDir, 'sudo'), 0o755)
  return binDir
}

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'ttr-'))
  mkdirSync(join(dir, 'src-tauri'))
  writeFileSync(join(dir, 'package.json'), '{\n  "name": "t",\n  "version": "0.0.0"\n}\n')
  writeFileSync(join(dir, 'src-tauri/tauri.conf.json'), '{\n  "productName": "t",\n  "version": "0.1.0"\n}\n')
  writeFileSync(join(dir, 'src-tauri/Cargo.toml'), '[package]\nname = "app"\nversion = "0.1.0"\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'chore: scaffold')
  return dir
}

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

function featCommit() {
  writeFileSync(join(repo, 'a.txt'), 'a')
  git(repo, 'add', '-A')
  git(repo, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'feat: agenda view')
}

function run(script, ...args) {
  try {
    const stdout = execFileSync('bash', [join(SCRIPTS, script), ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`,
             GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com',
             GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
    })
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

const calls = () => (existsSync(join(repo, 'calls.log')) ? readFileSync(join(repo, 'calls.log'), 'utf8') : '')
const tags = () => git(repo, 'tag').split('\n').filter(Boolean)

beforeEach(() => { repo = scaffold(); bin = stubBin(repo) })
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('release.sh', () => {
  test('tags the release and then builds it', () => {
    featCommit()

    const r = run('release.sh')

    expect(r.status).toBe(0)
    expect(tags()).toEqual(['v0.2.0'])
    expect(calls()).toContain('npm run tauri build')
  })

  test('does not build when there is nothing to release', () => {
    const r = run('release.sh')

    expect(r.status).not.toBe(0)
    expect(calls()).not.toContain('npm')
    expect(tags()).toEqual([])
  })

  test('--dry-run neither tags nor builds', () => {
    featCommit()

    const r = run('release.sh', '--dry-run')

    expect(r.status).toBe(0)
    expect(tags()).toEqual([])
    expect(calls()).not.toContain('npm')
  })
})

describe('install.sh', () => {
  test('installs the .deb built for the version it just tagged', () => {
    featCommit()

    const r = run('install.sh')

    expect(r.status).toBe(0)
    expect(tags()).toEqual(['v0.2.0'])
    expect(calls()).toContain('npm run tauri build')
    expect(calls()).toMatch(/sudo dpkg -i .*translucent-todo_0\.2\.0_amd64\.deb/)
  })

  test('--dry-run neither builds nor installs', () => {
    featCommit()

    const r = run('install.sh', '--dry-run')

    expect(r.status).toBe(0)
    expect(calls()).toBe('')
    expect(tags()).toEqual([])
  })
})
