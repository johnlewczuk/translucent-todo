import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))
const VERSION_SH = join(SCRIPTS, 'version.sh')

let repo

/** A throwaway repo shaped like this one: the four manifests plus a git history. */
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'ttv-'))
  mkdirSync(join(dir, 'src-tauri'))
  writeFileSync(join(dir, 'package.json'), '{\n  "name": "t",\n  "version": "0.0.0"\n}\n')
  writeFileSync(join(dir, 'src-tauri/tauri.conf.json'), '{\n  "productName": "t",\n  "version": "0.1.0"\n}\n')
  writeFileSync(join(dir, 'src-tauri/Cargo.toml'), '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n')
  writeFileSync(
    join(dir, 'src-tauri/Cargo.lock'),
    '[[package]]\nname = "anyhow"\nversion = "1.0.0"\n\n[[package]]\nname = "app"\nversion = "0.1.0"\n'
  )
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  commit(dir, 'chore: scaffold')
  return dir
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
}

function commit(dir, message) {
  git(dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message)
}

/** Run version.sh in the throwaway repo; returns {status, stdout, stderr}. */
function run(dir, ...args) {
  try {
    const stdout = execFileSync('bash', [VERSION_SH, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com',
             GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
    })
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

const read = (f) => readFileSync(join(repo, f), 'utf8')
const tags = () => git(repo, 'tag').split('\n').filter(Boolean)

beforeEach(() => { repo = scaffold() })
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('version.sh', () => {
  test('a feat with no prior tag takes 0.1.0 to 0.2.0 across all four manifests', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat: agenda view')

    const r = run(repo)

    expect(r.status).toBe(0)
    expect(tags()).toEqual(['v0.2.0'])
    expect(read('package.json')).toContain('"version": "0.2.0"')
    expect(read('src-tauri/tauri.conf.json')).toContain('"version": "0.2.0"')
    expect(read('src-tauri/Cargo.toml')).toContain('version = "0.2.0"')
    expect(read('src-tauri/Cargo.lock')).toContain('name = "app"\nversion = "0.2.0"')
  })

  test('the release commit is the tagged commit and the tree is left clean', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat: agenda view')

    run(repo)

    expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('chore(release): v0.2.0')
    expect(git(repo, 'rev-list', '-1', 'v0.2.0').trim()).toBe(git(repo, 'rev-parse', 'HEAD').trim())
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  test('the tag message carries the grouped release notes', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat(agenda): group by due date')

    run(repo)

    expect(git(repo, 'tag', '-l', '--format=%(contents)', 'v0.2.0'))
      .toContain('Features:\n  - agenda: group by due date')
  })

  test('release-neutral commits produce no tag and say so', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'docs: rewrite readme')

    const r = run(repo)

    expect(r.status).not.toBe(0)
    expect(r.stderr + r.stdout).toMatch(/nothing to release/i)
    expect(tags()).toEqual([])
    expect(read('package.json')).toContain('"version": "0.0.0"')
  })

  test('--dry-run reports the version but changes nothing', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'fix: stop losing focus')

    const r = run(repo, '--dry-run')

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('0.1.1')
    expect(tags()).toEqual([])
    expect(read('src-tauri/tauri.conf.json')).toContain('"version": "0.1.0"')
    expect(git(repo, 'status', '--porcelain')).toBe('')
  })

  test('a dirty tracked tree is refused', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat: agenda view')
    writeFileSync(join(repo, 'a.txt'), 'edited')

    const r = run(repo)

    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/uncommitted|dirty|clean/i)
    expect(tags()).toEqual([])
  })

  test('only commits since the last tag count toward the next bump', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat: agenda view')
    run(repo) // -> v0.2.0
    writeFileSync(join(repo, 'b.txt'), 'b')
    git(repo, 'add', '-A')
    commit(repo, 'fix: stop losing focus')

    const r = run(repo)

    expect(r.status).toBe(0)
    expect(tags()).toEqual(['v0.2.0', 'v0.2.1'])
  })

  test('--release-as overrides the computed version', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'fix: stop losing focus')

    const r = run(repo, '--release-as', '1.0.0')

    expect(r.status).toBe(0)
    expect(tags()).toEqual(['v1.0.0'])
    expect(read('package.json')).toContain('"version": "1.0.0"')
  })

  test('refuses when HEAD is already tagged', () => {
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(repo, 'add', '-A')
    commit(repo, 'feat: agenda view')
    run(repo)

    const r = run(repo, '--release-as', '9.9.9')

    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/already tagged/i)
    expect(tags()).toEqual(['v0.2.0'])
  })
})
