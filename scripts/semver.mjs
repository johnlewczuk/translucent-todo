/**
 * Pure Conventional Commits -> semver logic. No git, no filesystem, no process
 * exits — everything here is a function of its arguments so it can be tested.
 * The shell scripts in this directory supply the commit messages and act on the
 * answer.
 */

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:[ \t]*(?<subject>.+)$/
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:[ \t]*(.+)$/m

const RANK = { patch: 1, minor: 2, major: 3 }

/** Parse one commit message, or null if it isn't a conventional commit. */
function parse(message) {
  const [header, ...bodyLines] = String(message).split('\n')
  const m = HEADER.exec(header.trim())
  if (!m) return null

  const body = bodyLines.join('\n')
  const footer = BREAKING_FOOTER.exec(body)
  const { type, scope, bang, subject } = m.groups

  return {
    type,
    scope: scope || null,
    subject: subject.trim(),
    breaking: Boolean(bang) || Boolean(footer),
    // What actually broke: the footer if the author wrote one, else the subject.
    breakingNote: footer ? footer[1].trim() : subject.trim(),
  }
}

function bumpFor(commit) {
  if (commit.breaking) return 'major'
  if (commit.type === 'feat') return 'minor'
  if (commit.type === 'fix' || commit.type === 'perf') return 'patch'
  return null
}

/**
 * The largest bump any commit in the range calls for, or null when none of them
 * is release-relevant.
 */
export function decideBump(messages) {
  let winner = null
  for (const message of messages) {
    const commit = parse(message)
    if (!commit) continue
    const bump = bumpFor(commit)
    if (bump && (!winner || RANK[bump] > RANK[winner])) winner = bump
  }
  return winner
}

/**
 * Apply `bump` to `current`. Below 1.0.0 a breaking change is only a minor —
 * semver §4 makes no stability promise for 0.x, so reaching 1.0.0 stays a
 * deliberate act (--release-as 1.0.0) rather than something a commit triggers.
 */
export function nextVersion(current, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(current).trim())
  if (!m) throw new Error(`Cannot parse version "${current}" — expected MAJOR.MINOR.PATCH`)

  const [major, minor, patch] = m.slice(1).map(Number)
  const effective = major === 0 && bump === 'major' ? 'minor' : bump

  if (effective === 'major') return `${major + 1}.0.0`
  if (effective === 'minor') return `${major}.${minor + 1}.0`
  if (effective === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Unknown bump "${bump}"`)
}

/** Release notes for the tag message: grouped, breaking changes first. */
export function groupCommits(messages) {
  const commits = messages.map(parse).filter(Boolean)

  const line = (c) => (c.scope ? `  - ${c.scope}: ${c.subject}` : `  - ${c.subject}`)
  const sections = [
    ['BREAKING CHANGES', commits.filter((c) => c.breaking).map((c) => `  - ${c.breakingNote}`)],
    ['Features', commits.filter((c) => c.type === 'feat').map(line)],
    ['Fixes', commits.filter((c) => c.type === 'fix').map(line)],
    ['Performance', commits.filter((c) => c.type === 'perf').map(line)],
  ]

  return sections
    .filter(([, entries]) => entries.length > 0)
    .map(([heading, entries]) => `${heading}:\n${entries.join('\n')}`)
    .join('\n\n')
}
