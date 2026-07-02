# Mentorque AI Interview

Voice-first mock interviews where a candidate speaks with an adaptive AI interviewer. The app uses browser Web Speech APIs for speech recognition and text-to-speech, Gemini free tier for adaptive interview reasoning, Next.js API routes for auth/session control, PostgreSQL with Prisma for persistence, and LangGraph for the final scorecard workflow.

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run dev
```

Open `http://localhost:3000` in the latest Chrome or Edge, create an account, choose English, Hindi, or Hinglish, allow microphone access, and speak naturally. Say “end my interview” or “interview khatam” to finish by voice.

## Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: long random string for signed session cookies.
- `GEMINI_API_KEY`: free Google AI Studio API key.
- `GEMINI_MODEL`: defaults to `gemini-3.1-flash-lite`.
- `NEXT_PUBLIC_APP_URL`: deployed site URL, for example `https://your-app.vercel.app`.

## Architecture

- `app/api/interviews/[id]/respond`: sends the complete interview context to Gemini before generating each next response.
- `components/InterviewRoom.tsx`: runs the voice-only browser loop using speech recognition and speech synthesis.
- `lib/interviewPrompt.ts`: defines the adaptive interviewer behavior with no static question bank.
- `lib/gemini.ts`: server-only Gemini free-tier client shared by follow-ups and evaluation.
- `lib/interviewGraph.ts`: LangGraph workflow that turns the saved conversation into a structured scorecard using Gemini.
- `prisma/schema.prisma`: users, interviews, and transcript turns stored in PostgreSQL.

## Free Deployment

1. Create a free Neon PostgreSQL database and use its connection string as `DATABASE_URL`.
2. Create a free Gemini API key in Google AI Studio.
3. Import the repository into a free Vercel Hobby project or a free Render web service.
4. Add the environment variables below and run migrations with `npm run db:deploy`.

The app does not require a paid voice provider. Browser speech quality and recognition availability depend on the user’s browser and operating system.

### Vercel Settings

- Framework preset: `Next.js`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave empty / Next.js default
- Runtime: Node.js 20+
- After first deploy, run `npm run db:deploy` locally against the production `DATABASE_URL`, or use Vercel project settings → Deploy Hooks / CLI to run migrations before traffic.

### Render Settings

- Service type: `Web Service`
- Runtime: `Node`
- Build command: `npm install && npm run build && npm run db:deploy`
- Start command: `npm run start`
- Instance type: free
- Health check path: `/`

### Production Environment Variables

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require&channel_binding=require"
JWT_SECRET="generate-a-long-random-secret-at-least-32-chars"
GEMINI_API_KEY="your-free-google-ai-studio-key"
GEMINI_MODEL="gemini-3.1-flash-lite"
NEXT_PUBLIC_APP_URL="https://your-deployed-domain"
```

## Submission Notes

- No OAuth; candidates self-register with email/password.
- Voice is the primary interview surface; the live room does not present a chat box.
- One interview type is implemented deeply: role-focused technical/product mock interviews with adaptive follow-ups.
- The full stack can run on free tiers for a portfolio/demo workload, subject to provider quotas.
- A Loom walkthrough should cover problem understanding, architecture decisions, the Realtime loop, and a live end-to-end run.
