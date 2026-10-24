---
name: exam
description: Examine the user's understanding of a PR before approval, including its purpose, design, and specific code. Use when the user asks for a PR exam, quiz, or understanding check. Every question must pass before the PR is ready from the understanding side; ordinary code review does not start an exam.
---

# PR Exam

Examine whether the user understands the change well enough to review it. Keep the
conversation plain, respectful, and focused on the actual PR. Ask one question at a
time. Do not mark the exam passed until every question is answered correctly.

## Prepare from the code

Read the PR diff and the relevant callers, tests, and surrounding implementation.
Use the user's chosen PR, or the current branch's PR when it is unambiguous. Ask
for the target if needed. Do not invent code or treat the PR author's explanation,
previous assistant answers, or a successful build as proof of understanding.

Record the target, base and head revisions, and any included uncommitted changes.
Say which revision or working changes the exam covers. If the code cannot be
accessed, explain what is missing and keep the exam incomplete.

Prepare a finite set of questions proportional to the change. Establish what a
correct answer must explain before asking each question. Announce the question
count and broad coverage, but keep answers and grading notes out of the prompt.
Do not keep adding unrelated questions after the user meets the agreed scope.

Cover the following where they matter to this PR:

- The problem being solved and the resulting behavior.
- The path through the implementation, including relevant callers.
- Failure behavior, resource ownership, state, or concurrency.
- Design choices, tradeoffs, and what the tests do or do not establish.
- Several questions tied to specific code: explain a statement, trace a value or
  object, predict the result of removing a guard, or propose a small modification.
  For a tiny PR, scale the count down while retaining direct code examination.

Show a short code excerpt or a precise file reference for code questions. Let the
user consult the code. Test reasoning about behavior and consequences, not recall
of line numbers, exact method names, boilerplate, or language trivia. Hypothetical
code changes are questions, not instructions to edit the repository.

## Ask, assess, and follow up

Ask one focused question and wait for the user's answer. Keep a compact record in
the conversation of each question's topic, status, and remaining gap. Use stable
question numbers and the statuses **pending**, **needs follow-up**, and **passed**.
After each answer, give a brief assessment and the next question or follow-up.
Preserve this record when pausing or handing off the exam.

- Pass an answer when it covers the important behavior and consequences correctly
  in the user's own words. Accept equivalent reasoning and valid alternatives;
  exact terminology is not required.
- For a partly correct answer, acknowledge what is correct and ask about the
  specific missing point. Keep that question open until the gap is resolved.
- For an incorrect answer, identify the misconception without shaming the user.
  Offer a small hint and let them reason again. Do not use leading yes/no prompts
  that supply the answer and then count agreement as understanding.
- If the user asks for the explanation, give it. Afterwards, ask a fresh application
  question that tests the same idea before passing the original topic. Repeating
  your explanation or saying "I get it" does not pass it.
- If the user challenges your assessment, recheck the code. Correct your rubric
  when their reasoning is valid. Do not fail them for noticing a flaw in the PR
  or in your question.

There is no score average or partial-credit pass. A skipped question, an unresolved
follow-up, or an answer supplied only by the examiner keeps the exam incomplete.
If the user pauses or stops, report progress and respect that request; do not
silently waive the remaining questions or label the exam passed.

## Readiness

Before declaring a pass, verify that every question is passed and that the code
still matches the examined revision or working changes. If it changed, inspect the
new diff and reopen the affected topics. Keep unaffected passes; ask new questions
only for newly introduced material. If you cannot verify the current code, report
that limitation and leave readiness unconfirmed.

Finish with the examined revision, the passed/total count, and either:

- **Exam passed — ready from the understanding side.** Every question passed.
- **Exam incomplete — not ready from the understanding side.** List the open topics.

Keep this gate separate from code quality: passing does not establish that the PR
is correct, tested, or safe to merge. Report any known unresolved review or test
issues separately. Do not call the PR ready overall while those checks remain open.

The exam itself does not approve, merge, publish comments, or change PR status in
an external service. Those actions require the user's authorization. This skill
provides a conversational readiness gate, not an automated branch protection rule.
