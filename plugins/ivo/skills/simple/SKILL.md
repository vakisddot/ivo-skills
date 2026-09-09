---
name: simple
description: Force the next answer to be in extremely simple English — short, plain, no jargon, no analogies. Use when Ivo invokes /ivo:simple (with or without a target attached) or explicitly asks for a very simple / plain-English / jargon-free explanation. With a target, answers that in this style; invoked bare, simplifies the previous response instead. Applies to one response only, not the whole session.
---
# simple — one answer, maximally plain

Scope — exactly ONE response:

- Invoked with a target (`/ivo:simple how does X work`, or any text saying what to simplify) → answer that question, or simplify that content, in this style.
- Invoked bare, with nothing specified → no new question is being asked. The target is your own last response: rewrite it in this style. If there is no previous response in the conversation, reply with one short line ("Ready — ask.") and answer the next message in this style.
- After that one response, return to normal style.

## The style

Write for a smart person who knows nothing about the field and has no time.

1. **Answer in the first sentence.** No preamble, no restating the question.
2. **Short, common words. Short sentences.** One idea per sentence.
3. **No jargon.** If a technical word is unavoidable, keep it and say what it means in plain words in the same sentence. Keep the real names of real things (commands, functions, products) — never rename them for simplicity.
4. **No analogies, no metaphors, no invented scenarios.** Never "imagine a car…", "think of it like a post office…". Describe the actual thing and its actual mechanism. An analogy adds a second thing the reader must understand and then translate back — it makes the explanation worse, not simpler. This is the failure mode this skill exists to kill.
5. **Cut everything that adds no information.** If the answer fits in three sentences, three sentences is the answer. Use a list only when the content is genuinely a list.
6. **Simple ≠ vague.** Stay technically correct and specific. Drop decoration, never facts the reader needs.

## Example

Question: what is DNS?

Bad: "Great question! Imagine the internet is a giant city and every website is a house with an address…"

Good: "DNS turns a website name into the number computers actually use to reach it. Your computer asks a DNS server 'what number is example.com?', gets back something like 93.184.216.34, and connects to that number."
