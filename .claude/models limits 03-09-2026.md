Verified — best model until its daily quota runs out, then auto-fallback down the ladder, all logged in the console.

Your real limits
Gemini free tier (from your AI Studio dashboard):

Model	RPM	TPM	RPD
Gemini 3.6 Flash	5	250K	20/day
Gemini 3.5 Flash-Lite	15	250K	500/day
OpenAI Tier 1: gpt-4.1-mini & gpt-4o-mini = 500 RPM, 200K TPM, 2M TPD each.

Per-run math
tokens/run	cost	daily cap
gemini-3.6-flash	~700	free	20 (RPD), 5/min (RPM)
gemini-3.5-flash-lite	~700	free	500 (RPD), 15/min
gpt-4.1-mini	~1,600 in + 400 out	$0.0013	~1,000/day (2M TPD ÷ 2K)
$5 ÷ $0.0013 ≈ ~3,900 OpenAI runs on the credit.

The ladder (src/lib/llm/models.ts)
Agents	Order
learning, project, content, business, chief-of-staff	gemini-3.6-flash → gemini-3.5-flash-lite → gpt-4o-mini → deterministic
career, activity-analyzer	gpt-4.1-mini → gpt-4o-mini → gemini-3.5-flash-lite → deterministic
At each call runStructured skips models with no key / no daily budget, and on a live HTTP 429/5xx drops to the next. Every switch is a console line: gemini/gemini-3.6-flash out of daily quota — trying next → Calling gemini/gemini-3.5-flash-lite….

Effective daily budget: ~20 + 500 = 520 Gemini agent runs/day (3.6-flash then flash-lite), then deterministic. OpenAI agents: ~1,000/day by rate, ~3,900 total on the $5, then they too fall to flash-lite.

Footer (updates on completion, model-aware)
Gemini free tier (gemini-3.6-flash) · 3/20 requests today · ~17 left · ≈5/min → after fallback: (gemini-3.5-flash-lite) · … ~478 left · ≈15/min
OpenAI credit · $0.03 / $5.00 used · ~$4.97 left · ≈3,800 runs · ≈1,000/day (rate)
Verified live: ran chief-of-staff on 3.6-flash, injected 20 Gemini calls, re-ran → it moved to flash-lite, logged the switch, footer showed 22/500 · ~478 left · ≈15/min. tsc / eslint / 51 tests / build green.

Files: models.ts, quota.ts (per-model tables + hasHeadroom), index.ts (resolveModelConfig + runStructured walk the ladder), pricing.ts, all 7 agents (|| cfg.exhausted guard), console footer. Working tree now holds four uncommitted batches — say the word to commit them.