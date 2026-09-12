# Implementation Plan — Lightweight Google Docs Clone

Source spec: [`Task.md`](./Task.md)

## 1. Goal Restatement

Ship a small, coherent full-stack document editor demonstrating:
1. Rich-text document CRUD (create/rename/edit/save/reopen)
2. File upload → editable document import
3. Simple owner/shared-with sharing model
4. Durable persistence across refresh
5. Engineering quality: setup docs, deployment, tests, architecture note, AI-workflow note

Scope discipline: depth over breadth. No granular RBAC, no enterprise auth — mocked/seeded users are explicitly allowed by the spec. Real-time collaborative editing was originally scoped out below as a stretch-only item; it was later explicitly requested mid-build and promoted to a committed feature — see Phase 12.

We reviewed an existing open-source project (`git-init-priyanshu/Docx`) as a reference. It has no LICENSE, so nothing is copied from it — only a few validated *design* decisions (schema shape, extension choices, save-flow convention) carried over, reimplemented from scratch here.

## 2. Architecture Decisions (updated)

- **Separate frontend and backend codebases**, each with its own folder, its own `package.json`, and its own run script. Not a single full-stack framework (no Next.js API routes). This gives a clean REST boundary and matches "full stack execution across frontend, backend, persistence, and access logic" as distinct layers.
- **No Docker.** Everything runs as plain Node processes. Local Postgres is installed directly on the machine (Homebrew / Postgres.app / native installer), not containerized.
- **Postgres from day one** (not SQLite) — installed locally for dev, hosted (Neon/Supabase free tier) for the deployed version. Same schema and same Prisma client code path in both environments, only `DATABASE_URL` changes. This also removes the earlier SQLite-on-serverless persistence risk entirely.
- **Tests are deferred.** Core codebase and features come first; automated tests are written in a dedicated later phase (Phase 8), once the feature set is stable, not alongside each feature.

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vite + React + TypeScript**, React Router, Tailwind CSS | Lightweight SPA, fast dev server, independent of backend, easy static deploy |
| Rich text editor | **Tiptap** (ProseMirror-based) | Bold/italic/underline/headings/lists out of the box; stores content as JSON |
| Backend | **Node + Express + TypeScript** | Plain REST API, simple to run/deploy as its own process, no framework lock-in |
| ORM / DB | **Prisma + PostgreSQL** | Real relational DB from the start; same schema for local and hosted Postgres |
| Auth | **Mocked login** — pick a seeded user, backend issues a session (signed cookie or simple token) | Keeps scope reasonable per spec's explicit allowance |
| File upload/import | **.txt and .md upload** via `multer` on the backend, parsed to Tiptap JSON | Clearly bounded supported types, stated in UI + README |
| Validation | **Zod** on all backend route inputs | Basic validation/error handling requirement |
| Testing | **Vitest** (backend) — added in Phase 8, not before | At least one meaningful automated test, written once core logic is stable |
| Real-time collaboration | **Yjs + `y-websocket`** (server utils attached to Express's own `http.Server`) + Tiptap's `Collaboration`/`CollaborationCursor` extensions — added in Phase 12 | Added mid-build on explicit request; a maintained CRDT library rather than hand-rolled sync/awareness protocol handling, one process instead of a separate collaboration service |
| Deployment | Backend → Render/Railway (free tier, long-running Node process — also required for the collaboration WebSocket to work at all); Frontend → Vercel/Netlify (static build); DB → Neon/Supabase (free Postgres) | No Docker, no paid dependency, matches separate-process architecture |

## 4. Data Model (Prisma schema, lives in `backend/prisma/schema.prisma`)

```
User          { id, name, email (unique, seeded) }
Document      { id, title, contentJson, ownerId, createdAt, updatedAt }
DocumentShare { id, documentId, userId, permission ("view"|"edit"), createdAt }
```

- "Owned" = `document.ownerId === currentUser.id`
- "Shared with me" = documents joined via `DocumentShare.userId === currentUser.id`
- Frontend distinguishes the two in a sidebar/list (two sections: "My Documents" / "Shared with me")

## 5. Repo / Folder Structure

```
/frontend
  src/
    pages/            Login, DocumentList, Editor
    components/       Toolbar, ShareDialog, UploadDialog, DocListItem
    lib/               apiClient.ts, tiptapConfig.ts, auth.ts
    App.tsx, main.tsx
  index.html
  vite.config.ts
  package.json         scripts: dev, build, preview
/backend
  src/
    routes/            auth.ts, documents.ts, share.ts, upload.ts
    middleware/         auth.ts, documentAccess.ts, errorHandler.ts
    lib/                prismaClient.ts, markdownToTiptap.ts, validation.ts
    index.ts            Express app entry
  prisma/
    schema.prisma
    migrations/
    seed.ts
  tests/                added in Phase 8
  package.json         scripts: dev, build, start, db:migrate, db:seed
README.md
ARCHITECTURE.md
AI_WORKFLOW.md
SUBMISSION.md
PLAN.md
```

Each folder is independently runnable: `cd backend && npm run dev` and `cd frontend && npm run dev` in two terminals. README documents both commands explicitly; no root orchestration script/Docker required (a `concurrently`-based root convenience script may be added later as a nicety, not a dependency).

## 6. Phase-Wise Plan

### Phase 0 — Repo scaffolding
- Create `/frontend` and `/backend` folders at repo root, each with its own `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`.
- Root `README.md` stub describing the two-folder layout.
- No shared/root `node_modules` — each side installs independently.

### Phase 1 — Backend foundation
- Express + TypeScript app skeleton (`backend/src/index.ts`), health-check route.
- Install Postgres locally (Homebrew/Postgres.app), create a dev database.
- Prisma schema (`User`, `Document`, `DocumentShare`), run first migration against local Postgres.
- Seed script: 2–3 mock users, a couple of sample documents.
- Mock auth: `POST /auth/login` (pick seeded user by email) → session cookie/token; `getCurrentUser` middleware used by all protected routes.
- `npm run dev` (e.g. `tsx watch src/index.ts`) as the backend run script.

### Phase 2 — Frontend foundation
- Vite + React + TypeScript scaffold, Tailwind configured, React Router set up.
- API client wrapper (`lib/apiClient.ts`) pointing at `VITE_API_URL`.
- Login page: "Sign in as…" picker calling the backend auth route, storing session.
- `npm run dev` as the frontend run script, proxied or CORS-configured to hit the backend.

### Phase 3 — Document CRUD (core flow)
- Backend: `GET /documents`, `POST /documents`, `GET /documents/:id`, `PATCH /documents/:id` (title + content), `DELETE /documents/:id`, all behind auth + ownership/share checks.
- Frontend: document list page (create, rename, open, delete), editor page bound to a Tiptap instance, debounced autosave PATCH + explicit Save, reload-and-reopen verified to restore content.

### Phase 4 — Rich text formatting
- Tiptap toolbar: Bold, Italic, Underline, Heading levels/paragraph, bulleted list, numbered list.
- Confirm formatting round-trips correctly through save/reload.

### Phase 5 — File upload / import
- Backend: `POST /documents/import` using `multer`, accepts `.txt`/`.md` only (explicit MIME/extension check, clear 400 on rejection), converts content to Tiptap JSON, creates a new owned document.
- Frontend: upload control with clear "Supported: .txt, .md" messaging and inline error display on rejection.

### Phase 6 — Sharing
- Backend: `POST /documents/:id/share` (grant a seeded user view/edit access), `GET /documents/:id/access` as needed; access-control middleware enforced on all document routes (403 for non-owner/non-shared).
- Frontend: Share dialog (pick user by email, choose permission), visible "Owned by you" / "Shared by X" badges in list and editor header, "My Documents" vs "Shared with me" sections.

### Phase 7 — Validation & error handling
- Zod schemas on all backend inputs (title length, permission enum, file type/size).
- Consistent JSON error shape from the API; frontend surfaces errors via inline messages/toasts.
- Manual pass over edge cases: empty title, unauthorized access attempts, unsupported file upload, duplicate share.

### Phase 8 — Testing (starts only now, not earlier)
- Vitest in `backend/tests/`.
- Priority test: sharing/access-control logic (owner sees doc; unauthorized user is denied; shared "view" user cannot edit).
- Optional second test: upload parsing (`.txt`/`.md` → Tiptap JSON) on a couple of fixtures.

### Phase 9 — Docs
- `README.md`: two-terminal local setup (local Postgres install steps, backend `.env`, frontend `.env`, `npm run dev` in each folder), seeded accounts, supported file types.
- `ARCHITECTURE.md`: priorities and tradeoffs, why separate frontend/backend, why Postgres over SQLite, what was cut.
- `AI_WORKFLOW.md`: AI tools used, where they sped things up, what was changed/rejected, how correctness was verified.
- `SUBMISSION.md`: manifest of everything in the deliverable folder.

### Phase 10 — Deployment
- Backend → Render or Railway free tier (persistent Node process, not serverless — avoids the earlier SQLite/FS issue entirely since we're on Postgres regardless).
- Frontend → Vercel or Netlify static build, `VITE_API_URL` pointed at the deployed backend.
- Database → Neon or Supabase free-tier Postgres for production; same Prisma schema/migrations applied there.
- Verify CORS, cookies/session across the separate frontend/backend origins.

### Phase 11 — Walkthrough video
- Record after deployment is verified: main flow, what works end to end, what was deprioritized, key decisions, how AI supported the work.

### Phase 12 — Real-time collaboration (added mid-build, explicitly requested)
- Originally scoped out below as a stretch-only item; promoted to committed scope when explicitly asked for after Phase 9.
- Backend: `ws` WebSocket server attached to the existing Express `http.Server` (no third process), one room per document, gated at the upgrade handshake by the same `resolveDocumentAccess` function the REST routes use — `EDIT`/`OWNER` only, `VIEW` never opens a socket at all.
- Persistence: Yjs shared doc seeded from `Document.contentJson` on first connect (`y-prosemirror` JSON↔Y.Doc conversion against a server-side Tiptap schema matching the client's), debounce-saved back to the same column on every update, flushed on last-disconnect.
- Frontend: Tiptap's `Collaboration`/`CollaborationCursor` extensions bound to a `Y.Doc` + `WebsocketProvider`, only constructed when access is `EDIT`/`OWNER`; a live status indicator (connecting/live-with-peer-count/offline) in the editor header.
- Verified with two simultaneous browser sessions (bidirectional live sync + correct persistence after both disconnect) and with raw WebSocket-upgrade requests confirming the access gate at the protocol level (401 unauthenticated, 403 view-only, 101 edit-access).
- Known trade-off accepted for this pass: Tiptap's local undo/redo is disabled while collaborating, per Tiptap's own guidance (Yjs needs to own history for merges to stay correct); a Yjs-aware undo manager is a follow-up, not built here.

## 7. Scope Cuts (explicitly deprioritized, to state in README/architecture note)

- No comments/suggestion mode (stretch only)
- No version history in the initial cut (candidate stretch item if time remains)
- No `.docx` import — only `.txt`/`.md` (clearly documented)
- No granular roles beyond view/edit
- No real auth/password flow — seeded-user mock login only
- Docker intentionally excluded — plain Node processes + a directly installed Postgres, per explicit decision

If time remains after core (Phases 0–9) is solid, pick **one** stretch item — most likely **export to Markdown** or **basic version history**, both cheap on top of the Tiptap-JSON storage model.

## 8. Local Dev Requirements (no Docker)

- Node.js (LTS) installed.
- PostgreSQL installed locally, e.g. `brew install postgresql@16 && brew services start postgresql@16`, then `createdb docx_dev`.
- `backend/.env`: `DATABASE_URL="postgresql://<user>@localhost:5432/docx_dev"`, session secret.
- `frontend/.env`: `VITE_API_URL="http://localhost:<backend-port>"`.
- Two terminals: `cd backend && npm run dev`, `cd frontend && npm run dev`.

## 9. Deliverables Checklist (map back to spec)

- [x] Source code — `/frontend` and `/backend` folders
- [x] `README.md` — separate setup/run instructions per folder, local Postgres install steps, seeded accounts, supported file types
- [x] `ARCHITECTURE.md` — priorities and tradeoffs
- [x] `AI_WORKFLOW.md` — AI usage note
- [ ] `SUBMISSION.md` — manifest (write once deployment/video are ready to describe accurately)
- [ ] Live deployment URL (frontend + backend, both free-tier hosted)
- [ ] Walkthrough video URL (text file)
- [ ] Screenshots/GIF if any extra setup steps are needed
- [ ] Google Drive folder assembled with all of the above

## 10. Open Decisions to Confirm Before/While Building

- Exact free-tier hosts for backend (Render vs Railway) and DB (Neon vs Supabase) — finalize during Phase 10.
- Exact stretch feature if time allows after Phase 9 (leaning: Markdown export).
- Session mechanism specifics: signed httpOnly cookie vs simple bearer token, given frontend and backend are on different origins/ports in dev and likely different domains in prod (needs CORS + cookie `SameSite`/`secure` handling either way).
