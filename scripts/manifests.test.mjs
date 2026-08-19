import { describe, expect, test } from 'vitest'
import { setJsonVersion, setTomlVersion, setLockVersion } from './manifests.mjs'

describe('setJsonVersion', () => {
  const pkg = '{\n  "name": "translucent-todo",\n  "version": "0.0.0",\n  "type": "module"\n}\n'

  test('rewrites the version and nothing else', () => {
    expect(setJsonVersion(pkg, '0.2.0')).toBe(
      '{\n  "name": "translucent-todo",\n  "version": "0.2.0",\n  "type": "module"\n}\n'
    )
  })

  test('throws when there is no version key', () => {
    expect(() => setJsonVersion('{\n  "name": "x"\n}\n', '0.2.0')).toThrow(/version/i)
  })

  test('throws rather than rewrite a nested version key', () => {
    const nested = '{\n  "bundle": {\n    "version": "9.9.9"\n  },\n  "version": "0.1.0"\n}\n'
    expect(() => setJsonVersion(nested, '0.2.0')).toThrow(/top-level/i)
  })
})

describe('setTomlVersion', () => {
  const cargo =
    '[package]\nname = "app"\nversion = "0.1.0"\nedition = "2021"\n\n' +
    '[dependencies]\ntauri = { version = "2", features = [] }\n'

  test('rewrites the package version', () => {
    expect(setTomlVersion(cargo, '0.2.0')).toContain('name = "app"\nversion = "0.2.0"\n')
  })

  test('leaves dependency versions alone', () => {
    expect(setTomlVersion(cargo, '0.2.0')).toContain('tauri = { version = "2", features = [] }')
  })

  test('throws when there is no [package] version', () => {
    expect(() => setTomlVersion('[dependencies]\ntauri = "2"\n', '0.2.0')).toThrow(/\[package\]/)
  })
})

describe('setLockVersion', () => {
  const lock =
    '[[package]]\nname = "anyhow"\nversion = "1.0.100"\n\n' +
    '[[package]]\nname = "app"\nversion = "0.1.0"\ndependencies = [\n "tauri",\n]\n\n' +
    '[[package]]\nname = "tauri"\nversion = "2.0.0"\n'

  test('rewrites only the named package', () => {
    const out = setLockVersion(lock, 'app', '0.2.0')
    expect(out).toContain('name = "app"\nversion = "0.2.0"\n')
    expect(out).toContain('name = "anyhow"\nversion = "1.0.100"\n')
    expect(out).toContain('name = "tauri"\nversion = "2.0.0"\n')
  })

  test('throws when the package is absent', () => {
    expect(() => setLockVersion(lock, 'ghost', '0.2.0')).toThrow(/ghost/)
  })
})
