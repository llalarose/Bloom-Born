# BLOOM BOND MVP (H5 + Node)

Current status: **deployment-ready**.
If you do not currently have public platform access (for example Render team access, billing, or domain control), this repository is **not actually published yet**.

## Environment variables

Use [.env.example](/C:/Users/asus/Documents/Codex/2026-05-17/agent-ai-ai-agent-agent/.env.example) as the template.

Required secret:
- `DASHSCOPE_API_KEY` must be set in the deployment platform, never committed to this repo.

Notes:
- If `DASHSCOPE_API_KEY` is missing, the backend falls back to local mock replies.

## Short go-live steps (Render)

1. In Render, create a new `Web Service` and import this repository.
2. Use [render.yaml](/C:/Users/asus/Documents/Codex/2026-05-17/agent-ai-ai-agent-agent/render.yaml) for service setup.
3. In Render dashboard, set secret env var:
   - `DASHSCOPE_API_KEY=<your_real_key>`
4. Deploy and wait until service status is `Live`.

## Post-deploy verification URLs

Assume Render gives you:
- `https://<your-service>.onrender.com`

Verify:
- App home: `https://<your-service>.onrender.com/`
- Health (primary): `https://<your-service>.onrender.com/health`
- Config check (secondary): `https://<your-service>.onrender.com/api/config`
  - Expect JSON response with `modelConfigured` field.

## Local run (optional)

```bash
npm install
npm start
```

Local checks:
- `http://localhost:3000/`
- `http://localhost:3000/api/config`
