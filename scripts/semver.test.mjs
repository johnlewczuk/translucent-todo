import { describe, expect, test } from 'vitest'
import { decideBump, nextVersion, groupCommits } from './semver.mjs'

describe('decideBump', () => {
  test('returns null when no commit is release-relevant', () => {
    expect(decideBump(['docs: rewrite readme', 'chore: bump deps'])).toBe(null)
  })

  test('fix is a patch', () => {
    expect(decideBump(['fix: stop losing focus on Esc'])).toBe('patch')
  })

  test('perf is a patch', () => {
    expect(decideBump(['perf: memoize the agenda grouping'])).toBe('patch')
  })

  test('feat is a minor', () => {
    expect(decideBump(['feat: agenda view'])).toBe('minor')
  })

  test('a scope does not hide the type', () => {
    expect(decideBump(['feat(agenda): group by due date'])).toBe('minor')
  })

  test('a bang after the type is breaking', () => {
    expect(decideBump(['feat!: drop the pill mode'])).toBe('major')
  })

  test('a bang after a scope is breaking', () => {
    expect(decideBump(['refactor(storage)!: move todos.json'])).toBe('major')
  })

  test('BREAKING CHANGE in the body is breaking', () => {
    expect(decideBump(['fix: relocate state\n\nBREAKING CHANGE: todos.json moved'])).toBe('major')
  })

  test('the hyphenated BREAKING-CHANGE spelling also counts', () => {
    expect(decideBump(['fix: relocate state\n\nBREAKING-CHANGE: todos.json moved'])).toBe('major')
  })

  test('the largest bump in the range wins', () => {
    expect(decideBump(['fix: a', 'feat: b', 'docs: c'])).toBe('minor')
  })

  test('a type-like line in the body is not a type', () => {
    expect(decideBump(['docs: explain releases\n\nfeat: is how you request a minor'])).toBe(null)
  })

  test('an unconventional subject is ignored', () => {
    expect(decideBump(['Rewrote the whole storage layer'])).toBe(null)
  })
})

describe('nextVersion', () => {
  test('below 1.0 a breaking change bumps the minor', () => {
    expect(nextVersion('0.1.0', 'major')).toBe('0.2.0')
  })

  test('below 1.0 a feature bumps the minor', () => {
    expect(nextVersion('0.1.0', 'minor')).toBe('0.2.0')
  })

  test('below 1.0 a fix still bumps the patch', () => {
    expect(nextVersion('0.1.3', 'patch')).toBe('0.1.4')
  })

  test('at or above 1.0 a breaking change bumps the major', () => {
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  test('a minor bump clears the patch', () => {
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0')
  })

  test('a patch bump leaves major and minor alone', () => {
    expect(nextVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  test('rejects a version it cannot parse', () => {
    expect(() => nextVersion('v1.2', 'patch')).toThrow(/version/i)
  })
})

describe('groupCommits', () => {
  test('groups release-relevant commits under their heading', () => {
    const notes = groupCommits([
      'feat(agenda): group by due date',
      'fix: stop losing focus on Esc',
      'docs: rewrite readme',
    ])
    expect(notes).toBe(
      'Features:\n' +
      '  - agenda: group by due date\n' +
      '\n' +
      'Fixes:\n' +
      '  - stop losing focus on Esc'
    )
  })

  test('breaking changes lead, with the explanation', () => {
    const notes = groupCommits(['feat!: drop pill mode\n\nBREAKING CHANGE: Ctrl+M now hides to tray'])
    expect(notes).toBe(
      'BREAKING CHANGES:\n' +
      '  - Ctrl+M now hides to tray\n' +
      '\n' +
      'Features:\n' +
      '  - drop pill mode'
    )
  })

  test('a breaking commit with no explanation falls back to its subject', () => {
    const notes = groupCommits(['feat!: drop pill mode'])
    expect(notes).toBe(
      'BREAKING CHANGES:\n' +
      '  - drop pill mode\n' +
      '\n' +
      'Features:\n' +
      '  - drop pill mode'
    )
  })

  test('perf commits get their own section, after fixes', () => {
    const notes = groupCommits(['perf: memoize the agenda grouping', 'fix: stop losing focus'])
    expect(notes).toBe(
      'Fixes:\n' +
      '  - stop losing focus\n' +
      '\n' +
      'Performance:\n' +
      '  - memoize the agenda grouping'
    )
  })

  test('is empty when nothing is release-relevant', () => {
    expect(groupCommits(['docs: a', 'chore: b'])).toBe('')
  })
})
