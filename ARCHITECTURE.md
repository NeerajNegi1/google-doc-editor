# Architecture note

## What this is

A scoped slice of "Google Docs," not a clone of it: document CRUD with rich-text editing, one
level of sharing (owner + view/edit collaborators), file import, real-time collaborative editing,
and Postgres-backed persistence. The full brief is in [`Task.md`](./Task.md); the phased build
plan is in [`PLAN.md`](./PLAN.md). Real-time collaboration was originally scoped as the brief's
own optional stretch goal ("real-time collaboration indicators") and was elevated to a committed
feature mid-build at explicit request — see the dedicated section below.

## What I prioritized, and why

**Correctness of the access-control boundary over feature breadth.** Sharing is the one part of
this brief where a bug is invisible until it's a real problem — a view-only collaborator who can
somehow write, or a document a stranger can somehow read. So the entire access model is reduced
to two facts (`Document.ownerId`, and at most one `DocumentShare` row per user per document),
resolved in exactly one place (`backend/src/lib/documentAccess.ts`), checked on every document
route, and unit-tested directly against that function rather than only through the UI. The
frontend also disables editing for view-only access, but that's UX, not the actual boundary —
the backend check is what matters, and it's what's tested.

**A real backend/frontend split over a merged framework.** You explicitly asked for separate
`/frontend` and `/backend` folders with independent run scripts and no Docker. Beyond satisfying
that, it keeps the REST boundary honest: the frontend only ever talks to the backend over HTTP,
so there's no ambiguity about where access control lives (it can't leak into a server-component
or API-route file that blurs the line).

**Postgres from the start, not SQLite-then-migrate.** Using the same database engine (and the
same Prisma schema/migrations) locally and in production removes an entire class of "works on my
machine" risk, and it means the persistence requirement is already satisfied for a real
deployment, not just for a local demo.

**Tiptap's own JSON as the storage format.** `Document.contentJson` is a Postgres `jsonb` column
holding exactly what Tiptap's `getJSON()`/`setContent()` produce and consume. No intermediate
format, no lossy conversion on save or load — "formatting survives refresh" is true by
construction, not by careful synchronization of two representations.

**Deferring tests until the feature set stabilized, deliberately.** This was an explicit choice,
not neglect: CRUD, sharing, and upload were all built and manually verified first, then two test
suites were written against the pieces of logic that were both finished and highest-risk — access
control and the file-import converter — rather than writing tests against an API surface that was
still moving.

## Real-time collaboration: keeping the access boundary singular

Adding live co-editing after the access-control model was already built and tested created one
real risk: a second place where "can this user write to this document?" gets decided, which is
exactly the kind of duplication that lets a permission bug slip in unnoticed. The design avoids
that by construction rather than by discipline:

- **View-only access never opens a socket.** Live collaboration only exists for `OWNER`/`EDIT`
  access. A `VIEW` collaborator stays on the original static, read-only path — there's no
  "read-only over Yjs" mode to have gotten subtly wrong.
- **The WebSocket upgrade calls the same `resolveDocumentAccess` function the REST routes call**,
  before any Yjs protocol runs. It's not a parallel implementation of the permission check; it's
  the same one function, called from a second place, which is a much smaller thing to keep
  correct. Verified directly at the protocol level (not just through the UI) during manual
  testing: an unauthenticated upgrade gets `401`, a `VIEW`-only user's upgrade gets `403`, and an
  `EDIT`-access upgrade gets `101 Switching Protocols` — before any application data is exchanged.
- **One process, not a new service to deploy or secure.** The WebSocket server attaches to the
  same `http.Server` Express already listens on (`backend/src/collab/server.ts`), rather than
  running as a separate process with its own port, its own CORS story, and its own attack
  surface.
- **Persistence stays in the one place it already lived.** The collaborative session doesn't
  introduce a second source of truth — the shared Yjs document is seeded from and debounce-saved
  back into the exact same `Document.contentJson` Postgres column that non-collaborative saves
  use, via `y-prosemirror`'s JSON↔Y.Doc conversion running against the same Tiptap schema.

## Key decisions and tradeoffs

| Decision | Alternative considered | Why this way |
|---|---|---|
| Mocked login (pick a seeded user, signed session cookie) | Real password auth / OAuth | The brief explicitly allows this, and real auth adds no signal about the actual scope (docs, sharing, editing) |
| Owner + single share table, `VIEW`/`EDIT` only | A roles/permissions table | Two access levels is all the brief asks for; a roles table would be unused generality |
| `.txt`/`.md` import only, no `.docx` | Also support `.docx` | `.docx` needs a real parsing dependency for a format users rarely hand-author; markdown/plain text covers the "upload becomes a document" flow at much lower cost |
| Line-based hand-written markdown→Tiptap converter | A markdown AST library (e.g. `remark`) | The supported syntax (headings, bold/italic, two list types) is small enough that a dependency would cost more than it saves, and the converter is fully unit-tested |
| Multer with an extension allowlist, not a MIME-type check | Trust the browser's `Content-Type` | Browsers/OSes report inconsistent MIME types for `.md`; the extension is the one thing that's reliably present and checkable both client- and server-side |
| No Docker, native local Postgres | Docker Compose | Explicit requirement — also means "how do I run this" has no container layer to debug |
| Yjs + `y-websocket`'s server utilities, attached to the existing Express `http.Server` | Hand-rolled WebSocket sync protocol; or a separate collaboration microservice | CRDT merge logic and awareness-state cleanup-on-disconnect are exactly the kind of fiddly, easy-to-get-subtly-wrong code a maintained library should own; keeping it in-process avoids standing up and securing a second service |
| Debounced Yjs→Postgres save (on every update + flush on last disconnect) | A separate "live" store (e.g. keep content in Redis/Yjs only while editing) | Reuses the one persistence path and column that already existed; no second storage system to keep consistent with the first |

## What I'd build next with more time

1. **Deployment** (Phase 10) — backend as a persistent Node process (Render/Railway), frontend as
   a static build (Vercel/Netlify), a hosted Postgres for production.
2. **Route-level integration tests** — the current suite unit-tests the access-control and
   import logic directly; the next layer would exercise the actual Express routes end-to-end
   against a real (or dockerized-for-CI-only) Postgres, to catch wiring bugs the unit tests can't
   see.
3. **Live share updates** — if someone's access is revoked while they have the document open,
   they only find out on their next write attempt (a view-only user was never connected live in
   the first place, so there's nothing to revoke mid-session there; an edit-access user who loses
   access keeps their existing socket open until they navigate away or the process restarts).
4. **Version history** — the storage model (versioned JSON blobs) is already cheap to snapshot;
   this remains a candidate stretch item.
5. **Yjs-aware undo/redo** — currently disabled while collaborating (see README); a
   `y-prosemirror` `UndoManager` bound per-user would restore it correctly.
