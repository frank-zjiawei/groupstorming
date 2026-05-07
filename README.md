# Groupstorming

An AI co-facilitator for small-group brainstorming sessions. Listens to a live conversation through your microphone, transcribes it with speaker diarization, maps ideas onto a live bubble graph, surfaces tensions and convergence prompts, and nudges the group when it gets stuck.

Built with Vite + React + TypeScript. Powered by Anthropic Claude (synthesis, evaluation, live analysis) and Deepgram (real-time speech-to-text with diarization).

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your keys:

   ```bash
   cp .env.example .env.local
   ```

   - `VITE_ANTHROPIC_API_KEY` — get one at https://console.anthropic.com/settings/keys
   - `VITE_DEEPGRAM_API_KEY` — get one at https://console.deepgram.com (USD 200 free credit on signup)

3. Start the dev server:

   ```bash
   npm run dev
   ```

   App runs at http://localhost:3000.

## Build

```bash
npm run build      # production build into dist/
npm run preview    # preview the production build locally
npm run lint       # type-check with tsc --noEmit
```

## Deploy

This is a static SPA. Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

> Heads-up: both API keys are exposed to the browser because the app uses `VITE_*` env vars and calls Anthropic / Deepgram directly from the client. If you deploy this publicly, treat the keys as compromised — anyone visiting the site can extract them. For a real production deployment, move Anthropic calls behind a serverless proxy and issue short-lived Deepgram tokens server-side.

### Vercel

1. Push this repo to GitHub.
2. Import it in Vercel — Vite preset is auto-detected.
3. Set `VITE_ANTHROPIC_API_KEY` and `VITE_DEEPGRAM_API_KEY` under Project Settings → Environment Variables (Production + Preview + Development).
4. Deploy.
