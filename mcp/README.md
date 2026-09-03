# Personal Context MCP server

Exposes the same `getPersonalContext()` engine the in-app agents use to any MCP
client (Claude Desktop, Claude Code, …), read-only, over stdio.

| Tool | What it returns |
|---|---|
| `get_personal_context({ purpose, query? })` | Structured slice (skills by level, in-progress work, recent learning, activity evidence) **+** semantically-retrieved knowledge. `purpose` ∈ `learning_plan · career_match · project_ideas · content_draft · business_scan`. |
| `search_knowledge({ query, k? })` | Top chunks from the personal knowledge base (repos, docs, ADRs, conversations). |
| `list_skills({ level? })` | Skills with proven level + confidence. |

It reuses the app's code and the same `DATABASE_URL` + embedding config, so it
never has its own query logic and is always consistent with the app.

## Run

From the **repo root** (so the `@/` tsconfig paths resolve):

```bash
node --import tsx --env-file=.env.local mcp/server.ts
```

Sanity-check with the inspector:

```bash
npx @modelcontextprotocol/inspector node --import tsx --env-file=.env.local mcp/server.ts
```

## Wire into a client

### Claude Code — `.mcp.json` in the repo (or `~/.claude.json`)

```json
{
  "mcpServers": {
    "personal-context": {
      "command": "node",
      "args": [
        "--import", "tsx",
        "--env-file=/ABS/PATH/personal-growth-ai-os/.env.local",
        "/ABS/PATH/personal-growth-ai-os/mcp/server.ts"
      ]
    }
  }
}
```

### Claude Desktop — `claude_desktop_config.json`

Same `command` / `args` shape under `"mcpServers"`.

Requires `OWNER_USER_ID` (or `ALLOWED_EMAILS`) and `DATABASE_URL` in the
`.env.local` you point `--env-file` at. Uses the session pooler like the rest of
the tooling — no extra setup.
