---
name: apply-followups
description: Draft the follow-up messages that are due today for open applications. Use when the user says "/apply-followups", "what follow-ups are due", or "draft my nudges".
---

# apply-followups

## 1. What's owed

```
pnpm apply due            # JSON, drives the drafting below
pnpm outreach status      # human view — channels used per job + [OVERDUE] markers
```

JSON list of open applications whose scheduled follow-up date has passed — each has `id`, `company`, `role`, `lastKind` (what was sent last), `dueAt`, `bundleDir`.

- `lastKind` was `submitted` / `recruiter_pitch` / `referral_pitch` → draft **follow-up #1**.
- `lastKind` was `follow_up_1` → draft **follow-up #2** (this is the last one; after it, stop unless there's a reply).

## 2. Draft into each folder

For each due application, write `follow-up-1.md` (or `follow-up-2.md`) into its `bundleDir`:

- 40–60 words, polite, specific.
- Reference the role and the strongest single proof point (from that folder's `proof-bundle.md`).
- Follow-up #1: light "still interested, happy to share more". Follow-up #2: brief, final, no pressure.
- If the folder has a `pitch-recruiter.md` / contact in `outreach-targets.md`, match that channel's tone.

## 3. After the user sends

```
pnpm apply touchpoint "<bundleDir|id>" --kind follow_up_1 --channel <email|linkedin>
```

This records it and (for follow_up_1) schedules follow-up #2 for ~7 days later. After follow_up_2, nothing more is scheduled.

## Rules

- Only draft — the user sends.
- Never a third scheduled follow-up. If they want to keep chasing, that's a manual `--kind note`.
