# resume/

| file | role |
|---|---|
| **`master.json`** | **Machine source of truth.** Every tailored résumé is built from this. Edit it, not the others. |
| `master.md` | Read-only rendered view of `master.json` (backend archetype, no JD). Regenerate after editing the JSON: `pnpm resume backend --out /tmp/r && cp /tmp/r/resume.md resume/master.md` |
| `Dipankar_Saha_Resume.pdf` | The human-authored résumé this repo mirrors — visual reference / what a recruiter would see. Keep `master.json` in sync with it. |
| `job-search.json` | Morning job-search config (`titles`, `excludeTitles`, `skills`, `targetCountries`, filters). |
| `out/` | gitignored — scratch output of `pnpm resume`. |

## Rendering

```
pnpm resume <backend|platform|ai-llm|auto> [--jd <file>] [--out <dir>]
```

Writes `resume.md` + `resume.html` + `resume.pdf` (PDF via a locally-installed
Chrome / Chromium / Edge printing the HTML — single-column, standard fonts, ATS-safe).
`/apply-morning` → `apply-prep` does the same per job, JD-tailored, into each
`applications/<date>/<company>__<role>/` folder.

Currently renders to ~2 pages. To force one page, trim project bullets / drop to
3 projects in `master.json` (a `has(jdProjects…).slice(0, 4)` cap is already in
`buildResumeModel`).
