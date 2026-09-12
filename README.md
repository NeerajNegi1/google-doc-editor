# Docs — a small Google Docs-style editor

A full-stack document editor: rich-text editing, owner/shared access, and Postgres-backed
persistence. Built as a scoped slice, not a full Google Docs clone — see [`PLAN.md`](./PLAN.md)
for the phased build plan and [`Task.md`](./Task.md) for the original brief.

## Current status

Implemented so far:
- Mock/seeded-user login with a signed session cookie
- Document create / rename / open / delete, with autosave
- Rich-text editing (Tiptap): bold, italic, underline, H1/H2/paragraph, bulleted & numbered lists
- Content persists in Postgres and survives refresh (verified formatting round-trips)
- Sharing: an owner can grant another seeded user `view` or `edit` access; the document list
  visibly separates "My Documents" from "Shared with me", and the editor enforces read-only
  access for `view` collaborators (both in the UI and on the backend)
- File upload: `.txt` and `.md` files can be uploaded and become a new owned document. Markdown
  headings, bold/italic, and bulleted/numbered lists are converted into the same rich-text
  format used by the editor; `.txt` files become one paragraph per line. Any other file
  extension is rejected client-side and server-side with a clear message.
- **Real-time collaborative editing**: anyone with `OWNER` or `EDIT` access sees each other's
  changes live, with named/colored collaboration cursors and a "Live · N editing" indicator —
  see **Real-time collaboration** below.
- Basic input/content validation on every write route (Zod), consistent JSON error shape,
  malformed-JSON and oversized-upload requests handled without crashing
- Automated tests for the two highest-risk pieces of logic: document access control and the
  markdown/text-to-editor converter (see **Testing** below)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`AI_WORKFLOW.md`](./AI_WORKFLOW.md)

Not yet built (see `PLAN.md` for the remaining phases): deployment.

## Architecture

Two independent apps, no Docker, no shared build step:

```
/backend   Node + Express + TypeScript + Prisma, REST API, Postgres, a WebSocket endpoint for live editing
/frontend  Vite + React + TypeScript, Tailwind CSS, Tiptap editor
```

They talk to each other over HTTP (`VITE_API_URL` → the backend's `/documents`, `/auth` routes)
and over WebSocket (`VITE_WS_URL` → `/collab/:documentId`, only while actively editing), each
with its own `package.json` and its own run script. The WebSocket server is attached to the same
Express process/port — there's no third service to run.

## Prerequisites

- Node.js 18+
- PostgreSQL, installed directly on your machine (no Docker). On macOS:

  ```bash
  brew install postgresql@16
  brew services start postgresql@16
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"   # add to your shell profile if you like
  createdb docx_dev
  ```

## Setup

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # edit DATABASE_URL if your Postgres user/port differs
npm run db:migrate            # creates tables in docx_dev
npm run db:seed               # seeds 3 users and 2 sample documents
npm run dev                   # starts the API on http://localhost:4000
```

`backend/.env`:
```
DATABASE_URL="postgresql://<your-macos-username>@localhost:5432/docx_dev"
PORT=4000
SESSION_SECRET="dev-secret-change-me"
FRONTEND_ORIGIN="http://localhost:5173"
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_URL and VITE_WS_URL both default to localhost:4000, fine for local dev
npm run dev                   # starts the app on http://localhost:5173
```

Open http://localhost:5173 — you'll land on a "Sign in as…" screen listing the seeded users.

## Seeded accounts

The seed script (`backend/prisma/seed.ts`) creates three users with no passwords — this is a
mocked auth flow, picking a user is all "login" does:

| Name | Email |
|---|---|
| Alice Kumar | alice@example.com |
| Bob Sharma | bob@example.com |
| Carol Mehta | carol@example.com |

Seed data: Alice owns "Welcome to Docs" and has shared it with Bob (`edit` access). Bob owns
"Bob's Draft". Sign in as Alice to see an owned doc; sign in as Bob to see both an owned doc and
a shared one; sign in as Carol to see an empty list until something is shared with her.

## Project structure

```
/backend
  src/
    routes/        auth.ts, documents.ts (CRUD + sharing sub-routes), upload.ts (import)
    middleware/     auth.ts (session), errorHandler.ts
    lib/            prismaClient.ts, session.ts, documentAccess.ts, validation.ts, markdownToTiptap.ts
    collab/         server.ts (WS upgrade + access gate), persistence.ts (Yjs ↔ Postgres), schema.ts
    index.ts        Express app entry
  prisma/
    schema.prisma   User, Document, DocumentShare
    seed.ts
/frontend
  src/
    pages/          LoginPage, DocumentListPage, EditorPage
    components/      Toolbar, ShareDialog, UploadDialog
    lib/             apiClient.ts, AuthContext.tsx
PLAN.md              phased build plan
Task.md              original assignment brief
```

## How access control works

- A `Document` has one `ownerId`.
- A `DocumentShare` row grants one other user `VIEW` or `EDIT` on one document.
- Every document route resolves the caller's access level (`OWNER` / `EDIT` / `VIEW` / none)
  from those two facts alone — there's no separate roles/permissions table. `resolveDocumentAccess`
  in `backend/src/lib/documentAccess.ts` is the single place this is decided, and it's checked on
  every read, write, delete, and share-management call.
- The frontend also disables editing UI for `VIEW` access, but that's a UX nicety — the backend
  check is what actually prevents a view-only collaborator from writing.

## Uploading a document

From the document list, click **Upload document** and choose a `.txt` or `.md` file (max 2MB).
It's parsed into the editor's rich-text format and opens immediately as a new document you own.
Only `.txt` and `.md` are supported — anything else is rejected with an inline error, both
before the request is sent (client-side extension check) and again on the server (in case that
check is bypassed).

## Real-time collaboration

Open the same document as two different signed-in users who both have `OWNER`/`EDIT` access and
edits sync between them live — no refresh, no save button. Each connected editor also shows a
named, colored cursor for the others, and the editor header shows a live status dot
("Connecting…" / "Live · N editing" / "Offline").

How it works:
- **Frontend**: a [Yjs](https://yjs.dev/) `Y.Doc` per open document, synced over a WebSocket
  (`y-websocket`'s `WebsocketProvider`) to the backend, bound into the editor via Tiptap's
  official `Collaboration` and `CollaborationCursor` extensions.
- **Backend**: a `ws` WebSocket server attached to the same HTTP server Express already runs on
  (see `backend/src/collab/server.ts`), keyed by document id. The very first thing that happens
  on a connection attempt — before any Yjs protocol runs — is an access check: the session cookie
  is verified and `resolveDocumentAccess` (the exact same function the REST routes use) must
  return `OWNER` or `EDIT`, or the upgrade is rejected with a real `401`/`403` and the socket
  never opens. **View-only access never gets a live connection at all** — it stays on the same
  static, read-only path it always used, so the access-control boundary from sharing isn't
  duplicated or weakened for the collaborative case.
- **Persistence**: the shared Yjs document is seeded from `Document.contentJson` the first time
  anyone opens a room, debounce-saved back to Postgres on every edit (~2s), and flushed
  immediately when the last collaborator disconnects — so this reuses the exact same storage
  column and format as non-collaborative saves; reopening after everyone leaves shows exactly
  what was last synced.
- **Known limitation**: Tiptap's own undo/redo (`Cmd/Ctrl+Z`) is disabled while collaborating —
  Yjs needs to own history for merges between multiple editors to stay correct, and wiring a
  Yjs-aware undo manager was left out of scope for this pass.

## Testing

```bash
cd backend
npm test
```

Two suites, 14 tests, no database required (Prisma is mocked):
- `tests/documentAccess.test.ts` — the owner/share access-resolution logic that every document
  route depends on: owner access, VIEW share, EDIT share, no-share-row, and that a missing
  document never falls back to a guess.
- `tests/markdownToTiptap.test.ts` — the file-import converter: headings, bold/italic, bullet and
  numbered list grouping, and that plain-text mode never interprets markdown syntax.

These were chosen deliberately over broader coverage: they're the two places a bug would be both
easy to introduce and hard to notice by eye (a permission check that's subtly wrong, or an import
that silently mangles content).

## Deployment

Backend and database on **Render** (a `render.yaml` Blueprint at the repo root provisions both
in one step — a free-tier Postgres and a free-tier web service for the backend, wired together
automatically), frontend on **Netlify**. No paid tier required.

### 1. Backend + database (Render)

1. Sign in to [Render](https://render.com) (free, GitHub sign-in works) and connect this GitHub
   repo.
2. **New +** → **Blueprint** → pick this repo. Render reads `render.yaml` and creates:
   - a free Postgres instance (`docx-postgres`)
   - a free web service (`docx-backend`) built from `backend/`, wired to that database via
     `DATABASE_URL`, with a random `SESSION_SECRET` generated automatically
3. Before the first deploy finishes, set one more environment variable on the `docx-backend`
   service: `FRONTEND_ORIGIN` = your Netlify URL (from step 2 below — deploy the frontend first
   if you don't have it yet, then come back and set this).
4. On boot, the service runs `prisma migrate deploy` automatically (see `backend/package.json`'s
   `start` script) — the schema is created on first deploy with no manual migration step.
5. Once live, run the seed script once against the production database from your machine:
   `DATABASE_URL="<paste the Render Postgres external connection string>" npm --prefix backend run db:seed`.

### 2. Frontend (Netlify)

1. Sign in to [Netlify](https://netlify.com) and connect this repo (a `netlify.toml` at the repo
   root already points it at `frontend/` with the right build command and publish directory).
2. Set two environment variables on the site: `VITE_API_URL` = your Render backend's `https://…`
   URL, and `VITE_WS_URL` = the same host with `wss://` instead of `https://` (e.g.
   `https://docx-backend.onrender.com` → `wss://docx-backend.onrender.com`).
3. Deploy. Netlify's SPA redirect rule (already in `netlify.toml`) makes client-side routes like
   `/documents/:id` work on refresh.

### Why this combination

- Render's free web service is a real persistent Node process (not serverless), which the
  collaboration WebSocket requires — see **Real-time collaboration** above.
- One Render Blueprint provisions backend *and* database together, so there's one dashboard to
  manage instead of two separate signups.
- The session cookie is already produced with `sameSite: "none"; secure: true` whenever
  `NODE_ENV=production` (see `backend/src/routes/auth.ts`) specifically so login works across the
  Netlify ↔ Render domain boundary — no extra configuration needed for that part.

## Known gaps / what's next

- Deployment is documented above but not yet live — it depends on hosting accounts (Render,
  Netlify) that only the project owner can create/authorize.
- No collaboration-aware undo/redo (see **Real-time collaboration** above).
- If someone's `EDIT`/`VIEW` access is changed while they have a document open, they only find
  out on their next action (a blocked write, or the live socket simply never having opened) —
  there's no push notification that access changed mid-session.
- `npm audit` flags moderate issues in a `qs` transitive dependency of Express, in the Vitest/Vite
  dev toolchain, and in the Tiptap 2.x core (a `mergeAttributes()` advisory fixed only in Tiptap
  3.x — low practical risk here since nothing in this app passes arbitrary user-controlled HTML
  attributes through that path, but worth knowing about). `y-websocket`'s optional LevelDB
  persistence dependency is also installed but never used (this app doesn't set `YPERSISTENCE`).
  (`multer` is on 2.x and vitest on 3.x, so the more serious issues flagged against their older
  majors don't apply here.)
