/**
 * Pure text transforms that stamp a version into the four manifests this
 * project keeps it in. Text transforms rather than parse-and-reserialize, so a
 * release commit touches exactly one line per file instead of reformatting it.
 * Every function throws rather than silently leaving a file unchanged — a
 * missed manifest is how the four copies drift apart.
 */

/** Set the top-level "version" of a JSON document. */
export function setJsonVersion(text, version) {
  const key = /^([ \t]*)"version"([ \t]*):([ \t]*)"[^"]*"/m
  const m = key.exec(text)
  if (!m) throw new Error('No "version" key found in JSON manifest')

  const updated = text.replace(key, `$1"version"$2:$3"${version}"`)

  // The regex matches the first "version" anywhere, which may be nested. Parse
  // the result and confirm we actually moved the top-level key.
  let parsed
  try {
    parsed = JSON.parse(updated)
  } catch (e) {
    throw new Error(`Rewriting the version produced invalid JSON: ${e.message}`)
  }
  if (parsed.version !== version) {
    throw new Error('Refusing to write: matched a nested "version", not the top-level one')
  }
  return updated
}

/** Set `version` in a Cargo.toml's [package] table. */
export function setTomlVersion(text, version) {
  const pkg = /(^\[package\]\n(?:[^\[]*?\n)?)version[ \t]*=[ \t]*"[^"]*"/m
  if (!pkg.test(text)) throw new Error('No version found under [package]')
  return text.replace(pkg, `$1version = "${version}"`)
}

/** Set the version of one [[package]] entry in a Cargo.lock. */
export function setLockVersion(text, name, version) {
  const entry = new RegExp(`(^name = "${name}"\\n)version[ \\t]*=[ \\t]*"[^"]*"`, 'm')
  if (!entry.test(text)) throw new Error(`No [[package]] named "${name}" in Cargo.lock`)
  return text.replace(entry, `$1version = "${version}"`)
}
