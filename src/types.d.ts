// Shared types for the neutral engine. Imported into JS via `@import`.
// @ref LLP 0003 — the Engine's data model

export interface Llp {
  number: number
  /** Kebab slug from the filename `NNNN-<slug>.<type>.md`. */
  slug: string
  type: string
  title: string
  status: string
  systems: string[]
  author: string
  date: string
  path: string
  /** LLP numbers this doc `@ref`s in its body (a design's coverage list). */
  refs: number[]
  /** Change sets this one depends on, from a `**Depends-on:**` header. */
  dependsOn: string[]
  /** Reconciler that minted this doc, from a `**Generated-by:**` header. */
  generatedBy?: string
}

export interface CoveredLlp {
  llp: Llp
  /** Design LLP ids (zero-padded) and/or the literal `'code'`. */
  by: string[]
}

export interface CoverageResult {
  /** Live request LLPs that need coverage. */
  eligible: Llp[]
  covered: CoveredLlp[]
  /** The Designer backlog: live requests covered by neither a design nor code. */
  uncovered: Llp[]
  /** LLPs acting as designs (type in DESIGN_TYPES). */
  designs: Llp[]
}

/** One merge commit on a branch's first-parent chain (`git log --first-parent --merges`). */
export interface MergeCommit {
  sha: string
  /** Full parent shas, in order; `parents[1]` is the merged-in tip. */
  parents: string[]
  /** The commit subject — the only surviving record of a deleted head ref's name. */
  subject: string
}

export interface Task {
  id: string
  branch: string
  deps: string[]
  brief?: string
  /**
   * Planner-rated complexity 1–5 (LLP 0022): the model-tier seed for the task's
   * first implementation attempt (1–3 → mechanical, 4 → worker, 5 → judgment).
   * Absent ⇒ mechanical. Seeds only the entry rung of the LLP 0021 ladder.
   */
  complexity?: number
}

export interface ReadyResult {
  ready: Task[]
  blocked: Task[]
  done: Task[]
}

/**
 * One `integration/*` change set as observed from git refs, with the gap action the
 * tick owes it — the fourth pipeline-family observation (LLP 0052).
 */
export interface ChangeSetState {
  slug: string
  /** The branch short name, `integration/<slug>`. */
  integration: string
  /** Repo-relative path of the plan LLP on the branch, or null when none parses. */
  plan: string | null
  /** Design Active on target (LLP 0016) — nothing owed, branch merely outlives its merge. */
  shipped: boolean
  /** The one gap action owed, or null when nothing is owed this tick. */
  action: 'plan' | 'implement' | 'create-pr' | null
  reason: string
  ready: Task[]
  blocked: Task[]
  done: Task[]
}

export interface NeutralConfig {
  /** Directory holding the LLP corpus (relative to repo root). */
  llpDir: string
  /** Source-code discovery for `@ref` coverage. */
  code: {
    exts: string[]
    exclude: string[]
  }
  /** Type -> pipeline role mapping. */
  roles: {
    request: string[]
    design: string[]
  }
  /** Statuses that count as live (left Draft). */
  liveStatuses: string[]
  /** reconcilePR review-rung fix-loop bound before a PR is surfaced as stuck. */
  maxReviewRounds: number
  /** Opt-in (LLP 0019): terminal rung squash-merges a finished PR instead of holding it. */
  automerge: boolean
  /** Opt-in preference (LLP 0073): use the target's queue when available, else ordinary merging. */
  mergeQueue: boolean
  /** Final reviewed-head ship-risk policy (LLP 0062/0069). */
  shipRisk: ShipRiskConfig
  /** Admission cap over non-frozen PR/change-set/fix work surfaces (LLP 0060). */
  maxActiveWork: number
  /** Context-autophagy trigger threshold T, in tokens (LLP 0013). */
  contextRecycleThreshold: number
  /** Repo-hygiene autophagy switches + cooldowns (LLP 0036/0047); future members add theirs here. */
  autophagy: {
    /** The code-cleanup idle initiative (LLP 0036). Default on; the held-PR boundary is the safety. */
    codeCleanup: boolean
    /** PR relevance audit (LLP 0079). Opt-in, recommendations only. */
    prBacklog: boolean
    /** Hours a member backs off after an accepted (merged) cleanup PR (LLP 0047). 0 disables. */
    cooldownAfterMergeHours: number
    /** Hours a member backs off after a rejected (closed-unmerged) cleanup PR; defaults longer (LLP 0047). 0 disables. */
    cooldownAfterRejectHours: number
  }
}

/** Complete repository PR inventory for the advisory autophagy scan (LLP 0079). */
export interface BacklogPR {
  number: number
  url: string
  title: string
  head: string
  headSha: string
  base: string
  baseSha: string
  updatedAt: string
}

export interface PRBacklogObservation {
  prs: BacklogPR[]
  fingerprint: string | null
  error: string | null
}

export type ShipRiskLevel = 'low' | 'medium' | 'high' | 'unknown'
export type ShipRiskThreshold = 'none' | 'low' | 'medium' | 'high'

export interface ShipRiskConfig {
  /** `observe` assesses and gates automerge; `off` preserves the risk-unaware legacy terminal. */
  mode: 'off' | 'observe'
  /** Highest assessed risk automerge may admit. */
  maxAutomerge: ShipRiskThreshold
}

export interface World {
  repo: string
  config: NeutralConfig
  llps: Llp[]
  coverage: CoverageResult
}

/**
 * One comment in a PR's thread, from `gh pr view --json comments`. Neutral posts
 * through the repo owner's own gh auth, so `author` cannot distinguish neutral from
 * the human — neutral's comments are recognised by their `<!-- neutral-… -->` body
 * markers instead (LLP 0026/0027).
 */
export interface PrComment {
  /** author.login; bots end in `[bot]`. */
  author: string
  body: string
  /** ISO 8601; gh returns comments in chronological order. */
  createdAt: string
}

/**
 * One recorded review round (LLP 0028/0029): a `<!-- neutral-review: <sha> <verdict> -->`
 * marker, normally signing a comment — the comment IS the round (LLP 0028) — or a
 * legacy PR-body marker (always clean: the body form was only ever written on success).
 */
export interface ReviewRecord {
  /** The head SHA the round covered, possibly abbreviated. */
  sha: string
  /** True when the round found nothing actionable. Only a clean record covering the current head satisfies the reviewed rung; a `findings` record counts the round toward `maxReviewRounds` without satisfying it (LLP 0029). */
  clean: boolean
}

export interface DeferredIssue {
  ordinal: number
  title: string
  marker: string
  labels: string[]
  body: string
}

export interface WaitHookInput {
  tool_name?: string
  tool_input?: Record<string, unknown>
}

export interface WaitHookResult {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse'
    updatedInput?: Record<string, unknown>
    permissionDecision?: 'deny'
    permissionDecisionReason?: string
  }
}

export interface WorkerResult {
  exitCode: number
  timedOut: boolean
  stdout: string
  stderr: string
  truncated: boolean
}

/** One independent final-head ship-risk assessment recorded in a marker-signed PR comment (LLP 0062). */
export interface ShipRiskRecord {
  sha: string
  level: ShipRiskLevel
  /** Highest proof level reached for the critical safety fact, 1–5. */
  evidence: number
  version: 1
}

/**
 * A PR's observed health from `gh pr view --json` — GitHub's own computation, read
 * fresh against the current head SHA (LLP 0002/0009), not the acting agent's claim.
 */
export interface PrObservation {
  number: number
  /** headRefName — the PR's source branch. */
  head: string
  /** baseRefName — the PR's target branch. */
  base: string
  isDraft: boolean
  /** MERGEABLE | CONFLICTING | UNKNOWN. */
  mergeable: string
  /** BEHIND | DIRTY | CLEAN | BLOCKED | UNSTABLE | UNKNOWN | DRAFT | HAS_HOOKS. */
  mergeStateStatus: string
  /** The raw statusCheckRollup array; rollupConclusion() reduces it. */
  rollup: any[]
  /** headRefOid — every downstream fact (green, reviewed) is keyed to this. */
  headSha: string
  /** PR body — carries the `<!-- neutral-triage: … -->` / `<!-- neutral-verdict: … -->` markers, plus legacy `<!-- neutral-review: … -->` markers (new review records live in the comment thread — LLP 0028). */
  body: string
  /** Label names. `neutral:stuck` is the human-held authorization boundary: when set, neutral could not auto-advance and the loop must not churn the PR (LLP 0009). `neutral:adopt` triggers adoption (LLP 0025/0058). */
  labels: string[]
  /** Whether neutral can push a heal to the head branch (LLP 0025): `!isCrossRepository || maintainerCanModify`. Own PRs are always pushable; a cross-repo fork only while the contributor allows maintainer edits. Absent ⇒ pushable. */
  canPush?: boolean
  /** True when this PR is in REVIEW-ONLY mode — a `neutral:review` delegation (LLP 0032), or an adopt fork neutral cannot push (LLP 0025). A pushable adoption is NOT foreign: it rides the own-PR ladder end-to-end (LLP 0058). Set at collection; own and adopted PRs leave it unset (⇒ the own-PR ladder). */
  foreign?: boolean
  /** True when the PR carries `neutral:review` (LLP 0032): the narrower, review-only delegation. Forces LLP 0025's review-only mode regardless of push access — neutral reviews and posts the verdict but never pushes. Wins over `neutral:adopt` when both are present (a grant never widens implicitly). */
  reviewOnly?: boolean
  /** The comment thread, chronological — carries the marker-signed review records (LLP 0028), the stuck report, the human replies that unstick a held PR (LLP 0026/0027), and the `neutral: rounds +N` review-budget grants (LLP 0059). */
  comments: PrComment[]
  /** GraphQL node id, used to query the mergeQueueEntry field when queue mode is on. */
  nodeId?: string
  /** True when GitHub currently reports a merge queue entry for this PR (LLP 0060). */
  queued?: boolean
}

/** The single rung action reconcilePR takes on a PR this tick (LLP 0009). */
export interface RungDecision {
  /** Triage may attempt current-PR fixes only while a verification round remains (LLP 0075). */
  canFix?: boolean
  /** Prior review marker for an own/adopted PR; verify the commit and review evidence before using it as a delta baseline (LLP 0078). */
  previousReviewSha?: string
  /** mergeable | green | reviewed | ship-risk | terminal. */
  rung: string
  /**
   * wait | merge-base | resolve-conflict | fix-ci | review | triage | assess-ship-risk | ready-hold | merge | enqueue |
   * stuck-report | unstick | held | approve | request-changes | mark-adopted.
   * `triage` (unchanged findings or review rounds exhausted) is where a blanket `stuck` used to be: the worker
   * judges residual findings, records safe deferrals, or sets `neutral:stuck`. Only
   * evidenced defects get automatic `neutral:fix` admission (LLP 0075). `selectRung` no
   * longer emits `stuck` as an action — the label, once set, short-circuits into a three-way
   * classifier over the comment thread (LLP 0026/0027): `stuck-report` when no marker-signed
   * stuck report exists yet (post it), `unstick` when a human replied after the latest report
   * or pushed since it (remove the label, ack, re-run the rungs next tick), else `held`.
   * `merge` is the terminal action only when the repo opted in (`automerge`, LLP 0019):
   * flip ready if draft, then squash-merge — instead of `ready-hold`/`held`.
   * `enqueue` replaces `merge` when `mergeQueue` is on and GitHub confirms a queue
   * (LLP 0073); an already queued PR returns `wait` with `approved: true` until
   * GitHub lands or removes it.
   * `approve` / `request-changes` are the terminal + degraded actions for a *review-only*
   * foreign PR (LLP 0025/0058): they set the `neutral:approved` / `neutral:changes-requested`
   * verdict labels instead of readying or merging a contributor's PR. `request-changes` also
   * stands in for every heal rung (merge-base/resolve-conflict/fix-ci) — review-only never
   * pushes. A pushable adoption is not foreign and takes the own-PR actions above (LLP 0058).
   * `mark-adopted` is the one action emitted for a *merged* PR: an adoption that landed
   * (merged ∧ `neutral:adopt`) but does not yet carry its `neutral:adopted` completion record
   * (LLP 0031) — a mechanical label add, set-if-absent, so it fires at most once per PR.
   */
  action: string
  reason: string
  /**
   * Own PRs only (LLP 0030/0062): `true` throughout the reviewed-clean tail (mergeable ∧
   * green ∧ reviewed, not stuck — including `assess-ship-risk` and its observation hold).
   * The skill syncs the
   * `neutral:approved` label to this field each tick: added when `true`, removed otherwise, so
   * the label tracks the current reviewed-clean head and never goes stale. Absent/falsy on
   * every heal/review/stuck/triage rung and on foreign PRs (which use the verdict label via
   * `approve`).
   */
  approved?: boolean
  /** Current-head ship-risk assessment, present after the risk gate has a record (LLP 0062/0069). */
  shipRisk?: ShipRiskLevel
  /** Highest proof level recorded for the critical safety fact, 1–5. */
  shipRiskEvidence?: number
  /** Whether `shipRisk` is within the repo's configured automerge threshold. */
  shipRiskEligible?: boolean
  /** Current automerge intent is on and this assessment is eligible, so the terminal may land. */
  wouldAutomerge?: boolean
}

/** One work surface consuming (or frozen outside) the admission cap (LLP 0060). */
export interface AdmissionSurface {
  kind: 'pr' | 'changeset' | 'issue'
  target: string
  reason: string
}

/** Deterministic new-work admission state emitted by `neutral observe` (LLP 0060). */
export interface AdmissionState {
  limit: number
  used: number
  available: number
  open: boolean
  active: AdmissionSurface[]
  frozen: AdmissionSurface[]
  reason: string
}

/** One reason a tick is not idle: a gap still in flight in one of the families (LLP 0013). */
export interface IdleBlocker {
  /** pipeline | maintenance. */
  family: string
  /** The gap's target — `llp#N` | `changeset/<slug>` | `pr#N` | `issue#N`. */
  target: string
  reason: string
}

/**
 * Whether a tick is at rest across both reconciler families, with the blockers that
 * hold it open (empty ⇔ idle). Half the context-autophagy trigger (LLP 0013).
 */
export interface IdleState {
  idle: boolean
  blockers: IdleBlocker[]
}

/**
 * One repo-hygiene autophagy member's eligibility this idle tick (LLP 0047): on in
 * config, past its cooldown since its last PR disposition, and not no-op damped. Pure
 * over the prs observation, the closed-autophagy dispositions, config, and the clock.
 */
export interface MemberState {
  /** Member id — the `autophagy/<id>-*` branch namespace (e.g. `cleanup`). */
  id: string
  eligible: boolean
  /** Wall-clock ms of cooldown left before this member may run again; 0 when not in cooldown. */
  cooldownRemaining: number
  /** Epoch ms of this member's last autophagy PR disposition, or null if it has never run. */
  lastDisposition: number | null
  reason: string
}

/**
 * The idle tick's selected repo-hygiene initiative (LLP 0047 §selection): the
 * least-recently-run eligible member, or null for a deliberately idle tick, plus the
 * per-member breakdown for logging.
 */
export interface InitiativeSelection {
  /** The selected member id, or null when every member is off / in cooldown / damped / gated. */
  initiative: string | null
  members: MemberState[]
}

/** A `neutral:fix` issue's fix-attempt state, re-derived from ground truth (LLP 0009). */
export interface IssueFixState {
  number: number
  title: string
  /** needs-fix | attempt-exists | stuck. */
  state: 'needs-fix' | 'attempt-exists' | 'stuck'
  /** how state was found: `branch:fix/issue-N` | `pr:#M` | `closed-pr:#M` | `label:neutral:stuck`. */
  via?: string
}

/** One observed branch tip, normalized across local and origin-tracking refs. */
export interface BranchTip {
  name: string
  sha: string
}

/** Minimal all-state PR history used to retire disposed work surfaces (LLP 0063). */
export interface PullRequestHistory {
  number: number
  body: string
  head: string
  headSha: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
}

/** Fleet-silence verdict — one classifySilence read (LLP 0057 §fleet-silence). */
export interface SilenceVerdict {
  silent: boolean
  /** Epoch ms of the fleet's last sign of life: max(newest usage event, boot). */
  sinceMs: number
  /** Minutes since that sign of life. */
  quietMin: number
}

/** The sentinel's in-process incident memory (Slack history is the durable dedupe). */
export interface SentinelIncident {
  sinceMs: number
  /** ts of the Slack root message this incident threads under. */
  rootTs: string
  lastNagMs: number
}

/** What one sentinel pass should do, from the pure state machine (LLP 0057). */
export type SentinelAction =
  | { action: 'none' }
  | { action: 'open', sinceMs: number }
  | { action: 'nag' }
  | { action: 'recover', recoveredMs: number }
  | { action: 'reopen', sinceMs: number, recoveredMs: number }

/** Alert decoration probes; null = probe itself failed / unavailable (LLP 0057 §notify-direct). */
export interface SentinelProbes {
  api: boolean | null
  gateway: boolean | null
  sessions: string[] | null
}
