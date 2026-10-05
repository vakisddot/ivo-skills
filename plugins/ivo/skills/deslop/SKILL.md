---
name: deslop
description: Find and remove unnecessary code, duplication, comment noise, confusing constructs, and convention drift using repository evidence. Use for a deliberate slop audit or cleanup of current changes, a named area, or a repository. Ordinary implementation and general code review belong to code; this skill focuses on justified cleanup that preserves supported behavior.
---

# deslop

Reduce what Ivo must understand and maintain. Treat slop as avoidable maintenance
work without a justified purpose, or a departure from established project rules.
Judge the code and its context, not whether it appears to have been written by AI.
Fewer lines, fewer tests, and fewer abstractions are not goals on their own.

## Establish the request and scope

- An audit, review, or bare invocation produces findings without edits. A request
  to clean up, remove slop, or apply findings authorizes changes within that scope;
  no special keyword or repeated approval is required.
- Honor named paths and the scope established in the conversation. Otherwise focus
  on the current task's changes. For a branch review, use its actual comparison
  base and include staged, unstaged, and relevant untracked source files; do not
  assume the base is named main. If no useful scope or base can be established,
  ask rather than silently expanding to the whole repository.
- Read callers, configuration, and tests outside the editing scope when needed
  to understand a candidate. Wider inspection does not authorize wider changes.
- A whole-repository request starts with an inventory and prioritized areas. If
  cleanup is authorized, work through small, coherent batches. State what was
  actually inspected; a sample is not an exhaustive audit.
- Exclude generated output, vendored code, and historical migrations unless
  specifically included. Prefer fixing a generator over its generated output.

## Learn the local rules

Read applicable CLAUDE.md, AGENTS.md, or equivalent instructions, relevant lint
and formatter configuration, and representative code in the same subsystem.
Explicit current requirements take precedence over inferred conventions. Cite
nearby examples for an implicit convention; a mixed codebase or active migration
may not have one uniform rule. Ask when the intended standard would materially
change the proposed cleanup.

Use the project's existing analyzers and symbol tools where helpful, then inspect
their findings in context. A text match, complexity threshold, or unused-code
report is a lead, not a deletion decision. Check tool coverage and configuration
before trusting absence of results. Do not build a new scanner for an ordinary
cleanup pass.

## Evaluate candidates

- **Duplication:** Find repeated responsibilities, not just matching text. Share
  logic when the copies implement the same rule and should change together.
  Prefer an existing helper when it fits. Keep superficially similar code separate
  when its rules differ; an extraction that needs special-case flags or couples
  unrelated components may increase maintenance work.
- **Comments:** Remove narration of obvious operations, stale commented-out
  alternatives, and vague prose that adds no useful information. Correct a stale
  explanation when its purpose still matters. Preserve rationale, constraints,
  subtle behavior, necessary public documentation, licenses, and tool directives.
- **Unused code:** Trace supported entry points and consumers before removing
  declarations, files, parameters, or dependencies. Account for dynamic loading,
  registration, reflection, build variants, configuration, scripts, and public
  exports used outside the repository. A lack of text references or test coverage
  does not establish that code is dead. If a group of declarations refers only to
  itself, check whether a supported entry point reaches it or a contract requires it.
- **Readability:** Replace unnecessarily dense expressions, hidden side effects,
  nested conditionals, or misleading names with clearer equivalents. A one-line
  function is fine when it is easy to understand. Keep useful boundaries instead
  of combining unrelated concerns, and check measured or documented performance
  needs before replacing a specialized implementation.
- **Consistency:** Align naming, structure, and error-handling patterns with the
  relevant established convention. Preserve externally required names and formats.
  Investigate type escapes that hide a mismatch; repair the mismatch rather than
  adding casts or suppressions to make the cleanup pass checks.
- **Unnecessary machinery:** Investigate pass-through layers, speculative options,
  repeated validation, and fallback paths without a current purpose. Identify the
  guarantee and boundary each one serves. Preserve real recovery, compatibility,
  resource handling, and input protection. Do not remove a check merely because
  neighboring code lacks it or its failure is uncommon.

Tests can also contain duplication or obsolete support code. Compare the behavior
and failures they protect, not just their shape. A test that copies the production
calculation may provide weak evidence, but that does not make the behavior useless.
Keep independent checks of supported outcomes, including rejection and error
paths. Retiring a test does not justify retiring its production behavior; establish
that separately. A test may be the clearest record of a still-supported contract.

## Decide from evidence

For each worthwhile candidate, identify its location, the supporting evidence,
the concrete maintenance cost, and the smallest useful change. Distinguish:

- **Supported:** The relevant callers, contracts, or rules justify the change.
- **Needs investigation:** A specific missing fact could reverse the decision.
- **Preference only:** There is no established rule or concrete benefit beyond
  personal taste; leave it alone unless Ivo asks for that style change.

Keep confidence separate from importance and change risk. Missing documentation
is uncertainty, not proof that a requirement has ended. Supported compatibility
needs evidence of retirement before removal. Resolve uncertain candidates through
further inspection or a focused question; do not let permission to clean up stand
in for evidence. Prioritize meaningful improvements over cosmetic volume, and
accept that there may be nothing worth changing.

## Apply and verify

- Make supported local changes within the authorized scope. Before changing a
  shared abstraction, architecture, algorithm, or public API in a way that involves
  a meaningful tradeoff, explain the options and let Ivo choose. Routine cleanup
  should not require approving every edit.
- Preserve supported inputs, outputs, failure behavior, and public or persisted
  contracts. Keep security, concurrency, resource, and performance guarantees.
  If a candidate requires changing behavior, surface that as a separate decision.
- Remove support code made obsolete by the cleanup when it is also in scope.
  Avoid unrelated formatting, new dependencies, and speculative replacement layers.
- Use existing checks appropriate to the change. Preserve useful tests and add
  focused coverage only for a real verification gap; do not weaken assertions or
  delete supported cases to obtain a passing result. Passing tests are evidence,
  not proof that every contract is preserved. Honor requested limits on testing
  and state what remains unverified.
- Re-read the final diff for unintended behavior changes and scope creep. Report
  the inspected or changed scope, the important findings and their evidence, checks
  actually run, and unresolved candidates worth Ivo's attention. Mention a deliberate
  preservation decision when it explains why suspicious code remains. Avoid slop
  scores, finding quotas, and reports longer than the cleanup warrants.

## Influences

Independent synthesis of Ivo's criteria and ideas from
[Anthropic's code-simplifier](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md),
[Brian Lovin's deslop](https://github.com/brianlovin/agent-config/blob/main/skills/deslop/SKILL.md),
and [deslop-GPT](https://github.com/MrZoyo/deslop-GPT).
These are background references, not runtime dependencies or additional instructions.
