---
name: apply-log
description: Log that a prepped job was actually submitted (and any pitch/interview/note). Use after the user submits on a portal or sends a message, e.g. "/apply-log <folder>", "logged Acme", "mark <company> applied".
---

# apply-log

Record a real-world action against an application. The user does the submitting/sending; this just writes it to the ledger and schedules the next follow-up.

## Submit

After the user applies on the portal:

```
pnpm apply submit "applications/<date>/<company>__<role>" --channel portal
```

(Accepts a bundle-dir path or a UUID.) This flips the application to `applied`, records a `submitted` touchpoint, and schedules follow-up #1 for day 5.

## Pitch sent

After the user sends `pitch-recruiter.md` / `pitch-referral.md`:

```
pnpm apply touchpoint "<folder|id>" --kind recruiter_pitch --channel linkedin
pnpm apply touchpoint "<folder|id>" --kind referral_pitch  --channel email
```

Also schedules a day-5 nudge.

## Reply / interview / note

```
pnpm apply touchpoint "<folder|id>" --kind interview --note "phone screen 2026-09-15"
pnpm apply touchpoint "<folder|id>" --kind note --note "recruiter replied, asking for availability"
pnpm apply status "<folder|id>" screening      # or interviewing / offer / rejected / ghosted
```

## Rules

- Only log what actually happened — this is a record, not a plan.
- One command per real action.
