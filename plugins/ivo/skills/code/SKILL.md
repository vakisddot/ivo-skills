---
name: code
description: Write and review code with Ivo using the smallest complete solution that remains clear, correct, and maintainable. Use for implementation, refactoring, and code review, especially when considering unnecessary complexity, reuse, abstractions, or dependencies. Preserve useful tests and explanations.
---

# code

Build only what the current task needs. Prefer existing code and platform features.
Optimize for the amount of code Ivo must understand and maintain, not the fewest
lines or files.

Inspired by [Ponytail](https://github.com/DietrichGebert/ponytail).
These are independent instructions adapted to Ivo's preferences; they do not load
Ponytail's modes or require its installation.

## Choose the smallest complete solution

- Trace the relevant code and callers before choosing a change. Check whether the
  repository, standard library, platform, or an installed dependency already
  supplies what is needed.
- Separate today's requirements from possible future needs. Defer speculative
  features, extension points, configuration, and extra execution paths.
- Preserve requested behavior. If a smaller option changes scope or a meaningful
  tradeoff, explain it and let Ivo decide before implementing that alternative.
  Make routine implementation choices without turning every detail into a question.
- Use existing architecture and make small, complete changes that Ivo can review.
  Fix the cause of a bug rather than adding separate workarounds to its callers.
- Follow explicit project rules and established conventions in the relevant
  subsystem. Use nearby examples to establish implicit rules, and flag conflicts
  instead of imposing personal preferences. Preserve names required by external
  APIs and persisted formats.

## Spend complexity where it earns its place

- Add an abstraction when it removes real duplication, isolates a difficult
  boundary, or makes important behavior easier to test or understand. One
  implementation alone is not a reason to reject it.
  Share repeated logic when it represents the same rule and should change together;
  matching syntax alone does not justify coupling unrelated code.
- Prefer one clear path for the same behavior. Keep multiple paths only when their
  distinct use cases justify the extra maintenance.
- Avoid new dependencies for small tasks existing tools handle well. Do not
  reinvent a mature facility merely to avoid every dependency.
- Keep readable names, control flow, and useful file boundaries. Do not compress
  code into clever one-liners, merge unrelated files, or remove helpful comments
  just to reduce line count.
- Write comments for rationale, constraints, and non-obvious behavior. Avoid
  narrating obvious operations, and update explanations when the code changes.
  Keep useful public documentation and tool directives.
- Preserve correctness, input checks, failure handling, resource cleanup, and
  relevant performance requirements. A shorter change that weakens them is not
  a simplification.
- Make protective code enforce the guarantee it claims. Prefer preventing an
  invalid state or copying needed data over elaborate checks that cannot prove
  the property they promise.
- Give recovery and compatibility paths a current purpose. Avoid speculative
  fallbacks that mask bugs, but establish the boundary and supported failure
  behavior before removing existing checks.

## Validate and explain

- Use the project's existing test tools. Keep useful tests; add focused checks
  for changed behavior and realistic failures. Do not impose a test-count cap
  or write tests that merely restate the implementation.
- During review, check correctness and relevant performance as well as complexity.
  Tie each proposed deletion to an actual replacement or a need that can be
  deferred. Distinguish reproduced bugs, code-based findings, and preferences.
- Before deleting apparently unused code, check supported entry points, dynamic
  registration, build configuration, and external consumers as relevant. A lack of
  text references alone is not proof that code is unused.
- A review request authorizes inspection, not an unsolicited rewrite.
- Briefly explain the key choice, what changed, and how it was checked. State
  uncertainty and any unverified behavior. Provide fuller reasoning when Ivo
  asks for it; brevity must not hide a decision he needs to understand.
