import { env } from "@/lib/env";
import type { JobSearchConfig, RawJob } from "./types";

const UA = "Mozilla/5.0 (compatible; personal-job-search/1.0)";
const TIMEOUT = 12_000;

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}
async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const titleMatches = (title: string, cfg: JobSearchConfig) => {
  const t = title.toLowerCase();
  if (cfg.excludeTitles.some((x) => t.includes(x.toLowerCase()))) return false;
  return cfg.titles.some((wanted) => {
    const words = wanted.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return words.some((w) => t.includes(w));
  });
};

// ── keyless sources ──────────────────────────────────────────────────────

export async function remoteok(cfg: JobSearchConfig): Promise<RawJob[]> {
  const rows = await getJson<Record<string, unknown>[]>("https://remoteok.com/api");
  return rows
    .filter((r) => r.position && r.company)
    .filter((r) => titleMatches(String(r.position), cfg))
    .slice(0, cfg.maxPerSource)
    .map((r) => {
      const min = Number(r.salary_min) || 0;
      const max = Number(r.salary_max) || 0;
      return {
        source: "remoteok",
        company: String(r.company),
        role: String(r.position),
        location: (r.location as string) || null,
        remote: true,
        salaryText: min || max ? `$${min}-${max}` : null,
        postedAt: (r.date as string) || null,
        url: String(r.url),
        applyUrl: (r.apply_url as string) || null,
        publisher: null,
        descriptionSnippet: stripHtml(String(r.description ?? "")).slice(0, 1200),
        contactEmail: null,
      } satisfies RawJob;
    });
}

export async function remotive(cfg: JobSearchConfig): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const term of cfg.titles.slice(0, 4)) {
    const j = await getJson<{ jobs?: Record<string, unknown>[] }>(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=${cfg.maxPerSource}`,
    );
    for (const r of j.jobs ?? []) {
      if (!titleMatches(String(r.title ?? ""), cfg)) continue;
      out.push({
        source: "remotive",
        company: String(r.company_name ?? ""),
        role: String(r.title ?? ""),
        location: (r.candidate_required_location as string) || null,
        remote: true,
        salaryText: (r.salary as string) || null,
        postedAt: (r.publication_date as string) || null,
        url: String(r.url ?? ""),
        applyUrl: null,
        publisher: null,
        descriptionSnippet: stripHtml(String(r.description ?? "")).slice(0, 1200),
        contactEmail: null,
      });
    }
  }
  return out;
}

const WWR_FEEDS = [
  "remote-back-end-programming-jobs",
  "remote-full-stack-programming-jobs",
  "remote-devops-sysadmin-jobs",
];

export async function wwr(cfg: JobSearchConfig): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const feed of WWR_FEEDS) {
    const xml = await getText(`https://weworkremotely.com/categories/${feed}.rss`);
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    for (const it of items.slice(0, cfg.maxPerSource)) {
      const pick = (tag: string) =>
        it
          .match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]
          ?.replace(/^<!\[CDATA\[|\]\]>$/g, "")
          .trim() ?? null;
      const rawTitle = pick("title") ?? "";
      const [company, ...roleParts] = rawTitle.split(/:\s*/);
      const role = roleParts.join(": ") || rawTitle;
      if (!titleMatches(role, cfg)) continue;
      out.push({
        source: "wwr",
        company: company.trim(),
        role: role.trim(),
        location: pick("region"),
        remote: true,
        salaryText: null,
        postedAt: pick("pubDate"),
        url: pick("link") ?? "",
        applyUrl: null,
        publisher: null,
        descriptionSnippet: stripHtml(pick("description") ?? "").slice(0, 1200),
        contactEmail: null,
      });
    }
  }
  return out;
}

export async function hnWhoIsHiring(cfg: JobSearchConfig): Promise<RawJob[]> {
  // newest-first, then take the most recent real "Who is hiring?" thread
  const search = await getJson<{
    hits: { objectID: string; title: string; author?: string }[];
  }>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=hiring&hitsPerPage=10",
  );
  const story =
    search.hits.find((h) => /who is hiring\?/i.test(h.title)) ??
    search.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const item = await getJson<{
    children?: { text?: string; author?: string }[];
  }>(`https://hn.algolia.com/api/v1/items/${story.objectID}`);

  const out: RawJob[] = [];
  for (const c of item.children ?? []) {
    if (!c.text) continue;
    const text = stripHtml(c.text);
    if (!/remote/i.test(text)) continue;
    const firstLine = text.split(/\.\s|\n| - /)[0].slice(0, 240);
    if (!titleMatches(text, cfg)) continue;
    const segs = firstLine.split(/\s*[|·—]\s*/).map((s) => s.trim());
    const company =
      segs[0]?.replace(/\s*\([^)]*\)\s*/g, " ").slice(0, 60).trim() ||
      `HN (${c.author ?? "?"})`;
    const roleSeg = segs
      .slice(1)
      .find(
        (s) =>
          s.length < 60 &&
          /\b(engineer|developer|architect|sre|devops|full[- ]?stack|back[- ]?end|platform|lead|scientist)\b/i.test(s),
      );
    out.push({
      source: "hn",
      company,
      role:
        roleSeg ??
        cfg.titles.find((t) =>
          t.toLowerCase().split(/\s+/).some((w) => w.length > 2 && text.toLowerCase().includes(w)),
        ) ??
        "Engineer (see post)",
      location: /remote/i.test(text) ? "Remote" : null,
      remote: true,
      salaryText: text.match(/\$[\d,kK]+[\s-]*(?:to|-)?[\s-]*\$?[\d,kK]*/)?.[0] ?? null,
      postedAt: null,
      url: `https://news.ycombinator.com/item?id=${story.objectID}`,
      applyUrl: null,
      publisher: null,
      descriptionSnippet: text.slice(0, 1400),
      contactEmail: text.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/)?.[0] ?? null,
    });
  }
  return out.slice(0, cfg.maxPerSource);
}

// ── key-gated sources ────────────────────────────────────────────────────

export async function jsearch(cfg: JobSearchConfig): Promise<RawJob[]> {
  const key = env.JSEARCH_API_KEY;
  if (!key) throw new Error("JSEARCH_API_KEY not set");
  const out: RawJob[] = [];
  for (const term of cfg.titles.slice(0, 3)) {
    const j = await getJson<{ data?: Record<string, unknown>[] }>(
      `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(term + " remote")}&num_pages=1`,
      { "x-rapidapi-key": key, "x-rapidapi-host": "jsearch.p.rapidapi.com" },
    );
    for (const r of j.data ?? []) {
      out.push({
        source: "jsearch",
        company: String(r.employer_name ?? ""),
        role: String(r.job_title ?? ""),
        location:
          [r.job_city, r.job_state, r.job_country].filter(Boolean).join(", ") || null,
        remote: r.job_is_remote === true,
        salaryText:
          r.job_min_salary || r.job_max_salary
            ? `${r.job_min_salary ?? ""}-${r.job_max_salary ?? ""} ${r.job_salary_currency ?? "USD"} /${r.job_salary_period ?? "year"}`
            : null,
        postedAt: (r.job_posted_at_datetime_utc as string) || null,
        url: String(r.job_apply_link ?? ""),
        applyUrl: (r.job_apply_link as string) || null,
        publisher: (r.job_publisher as string) || null,
        descriptionSnippet: stripHtml(String(r.job_description ?? "")).slice(0, 1400),
        contactEmail: null,
      });
    }
  }
  return out.slice(0, cfg.maxPerSource * 2);
}

export async function adzuna(cfg: JobSearchConfig): Promise<RawJob[]> {
  const id = env.ADZUNA_APP_ID;
  const key = env.ADZUNA_APP_KEY;
  if (!id || !key) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
  const out: RawJob[] = [];
  for (const country of cfg.adzunaCountries.slice(0, 3)) {
    for (const term of cfg.titles.slice(0, 2)) {
      const j = await getJson<{ results?: Record<string, unknown>[] }>(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${id}&app_key=${key}` +
          `&what=${encodeURIComponent(term)}&results_per_page=${cfg.maxPerSource}&content-type=application/json`,
      );
      for (const r of j.results ?? []) {
        const co = r.company as { display_name?: string } | undefined;
        const loc = r.location as { display_name?: string } | undefined;
        out.push({
          source: "adzuna",
          company: co?.display_name ?? "",
          role: String(r.title ?? ""),
          location: loc?.display_name ?? null,
          remote: /remote/i.test(String(r.title ?? "") + (loc?.display_name ?? "")),
          salaryText:
            r.salary_min || r.salary_max
              ? `${r.salary_min ?? ""}-${r.salary_max ?? ""} ${country === "in" ? "INR" : "USD"} /year`
              : null,
          postedAt: (r.created as string) || null,
          url: String(r.redirect_url ?? ""),
          applyUrl: (r.redirect_url as string) || null,
          publisher: null,
          descriptionSnippet: stripHtml(String(r.description ?? "")).slice(0, 1400),
          contactEmail: null,
        });
      }
    }
  }
  return out;
}

export async function serpapi(cfg: JobSearchConfig): Promise<RawJob[]> {
  const key = env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY not set");
  // One google_jobs search per title = one SerpApi request. `serpapiMaxQueries`
  // (resume/job-search.json) caps how many titles we spend the monthly quota on.
  const terms = cfg.titles.slice(0, cfg.serpapiMaxQueries ?? 3);
  if (terms.length === 0) terms.push("software engineer");

  const out: RawJob[] = [];
  for (const term of terms) {
    const j = await getJson<{ jobs_results?: Record<string, unknown>[] }>(
      `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(term + " remote")}&api_key=${key}`,
    );
    for (const r of (j.jobs_results ?? []).slice(0, cfg.maxPerSource)) {
      const ext = (r.detected_extensions ?? {}) as Record<string, unknown>;
      const apply = (r.apply_options as { link?: string }[] | undefined)?.[0]?.link;
      out.push({
        source: "serpapi",
        company: String(r.company_name ?? ""),
        role: String(r.title ?? ""),
        location: (r.location as string) || null,
        remote: ext.work_from_home === true,
        salaryText: (ext.salary as string) || null,
        postedAt: null,
        url: apply ?? String(r.share_link ?? ""),
        applyUrl: apply ?? null,
        publisher: (r.via as string)?.replace(/^via\s+/i, "") || null,
        descriptionSnippet: stripHtml(String(r.description ?? "")).slice(0, 1400),
        contactEmail: null,
      } satisfies RawJob);
    }
  }
  return out;
}

export const SOURCES = {
  remoteok,
  remotive,
  wwr,
  hn: hnWhoIsHiring,
  jsearch,
  adzuna,
  serpapi,
} as const;
