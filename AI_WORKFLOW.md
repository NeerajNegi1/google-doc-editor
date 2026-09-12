# AI workflow note

## Which AI tools I used

Claude Code (Anthropic's agentic CLI) for essentially the entire build: turning the open-ended
brief into a phased plan, scaffolding both apps, writing the backend/frontend code, and — this is
the part that mattered most — driving the actual running app through a real Chrome browser to
verify behavior, not just reading the code back and assuming it worked.

## Where it materially sped things up

- **Boilerplate that has a right answer.** Express + TypeScript + Prisma wiring, Vite + React +
  Tailwind config, a Tiptap toolbar bound to editor commands — none of this is interesting, all
  of it is easy to get subtly wrong by hand (wrong `tsconfig` module target, a missing CORS
  credential flag, a Tailwind content glob that misses `.tsx` files). Generating it right the
  first time and verifying it compiles/runs saved the slow trial-and-error loop that boilerplate
  usually costs.
- **A small hand-written parser instead of reaching for a dependency.** The `.md`/`.txt` → Tiptap
  JSON converter (`backend/src/lib/markdownToTiptap.ts`) is about 100 lines and fully covered by
  tests. Writing that by hand, with tests, was fast enough that pulling in a markdown AST library
  — with its own transitive dependencies and API to learn — wasn't worth it.
- **End-to-end verification loop.** Being able to start both dev servers, drive the real UI
  (login as one seeded user, share with another, switch users, attempt a blocked edit, upload a
  file, reload to check persistence) and read back console/network state made it possible to
  catch integration bugs immediately rather than discovering them later by inspection.
- **Reading a library's actual source instead of guessing its API.** For the real-time
  collaboration feature, rather than writing code against a remembered/assumed API for
  `y-websocket`'s server-side utilities, Claude installed the package and read
  `node_modules/y-websocket/bin/utils.cjs` and `y-prosemirror`'s `.d.ts` files directly to get the
  exact function signatures and persistence-hook contract right the first time — noticeably
  faster than write-run-fail-guess-again cycles against an unfamiliar library.

## What I changed or rejected from the AI's own suggestions

- **Rejected reusing an open-source reference app wholesale.** Partway through planning, I had
  Claude review a related open-source project (`git-init-priyanshu/Docx`) to see if it could save
  time. It's genuinely more feature-rich than this brief (real-time collaboration, an AI writing
  assistant, RAG chat) — but it has no LICENSE (all-rights-reserved by default), its file-upload
  story doesn't match the brief (Google Docs import via OAuth, not a plain file upload), it ships
  no tests, and its deployment needs several paid/managed services. I rejected copying any of its
  code and had Claude reimplement the two or three design decisions worth keeping (the
  owner/share schema shape, the Tiptap extension choices) from scratch, so the codebase is
  traceably original.
- **Caught and rejected a UX regression: a blocking native `confirm()`.** The first version of
  document delete used `window.confirm()`. It's inconsistent with the rest of the UI, and during
  browser-driven testing it froze the automated session outright (native dialogs block the page).
  I had it replaced with an inline confirm/cancel control in the document list — better UX and no
  longer a landmine for either a real user or automated testing.
- **Caught a real autosave bug via live testing, not code review.** Loading a document into a
  read-only (view-only share) editor was firing Tiptap's `onUpdate` on the programmatic content
  load, which triggered a spurious autosave `PATCH` — safely rejected by the backend's permission
  check, but surfaced to the viewer as "Failed to save," which is misleading for something they
  never tried to do. This only became visible by actually signing in as the shared user and
  watching the UI, not by reading the component. Fixed by not emitting Tiptap's update event on
  programmatic `setContent` calls and by only initializing an editor's content once per document
  (a second, related bug: re-fetching the document after a title rename was about to reset the
  editor's content and cursor position on every keystroke-adjacent state update).
- **Proactively flagged and upgraded vulnerable dependencies rather than leaving them.**
  `multer` 1.x (deprecated, known CVEs) and an older `vitest`/`vite` chain (one critical, one high
  advisory) were caught by `npm audit` during setup. Both were upgraded to current majors once
  they became load-bearing (multer once uploads were real; vitest once tests were real) rather
  than left as "the scaffold's problem."
- **Real-time collaboration was a genuine mid-build scope change, not something I let slide.**
  It was originally planned as the brief's own optional stretch goal and explicitly deprioritized
  in the initial architecture plan. When I asked for live co-editing directly, Claude proposed
  keeping the existing sharing access-control boundary singular (live sockets only for
  `EDIT`/`OWNER` access, gated by the same `resolveDocumentAccess` function the REST routes
  already used) rather than a parallel permission model for the collaborative case — I accepted
  that framing rather than asking for something looser. Two real dependency-resolution bugs came
  up while wiring it in and were fixed, not worked around: an exact-pinned `@tiptap/core` version
  colliding with `@tiptap/starter-kit`'s own range produced two incompatible copies of the same
  package (fixed by matching the version range convention already used everywhere else in the
  project); and importing `y-websocket/bin/utils.cjs` failed under Node's strict package `exports`
  map because the package only exposes that subpath without the `.cjs` extension (fixed by reading
  the package's own `package.json` `exports` field rather than guessing).
- **A real bug reported by the user, root-caused rather than patched over.** After the
  collaboration feature shipped, testing surfaced duplicate "ghost" cursors for the same person
  and an inflating "N editing" count on every page reload. Rather than guessing, Claude checked
  actual OS-level TCP connections (`lsof`) against the server's reported participant count to
  confirm the sockets themselves weren't leaking — the leak was purely in Yjs awareness state —
  then traced it to React 18 StrictMode's dev-only double-invoked effects: each reload created two
  independent `Y.Doc`/`WebsocketProvider` pairs (each with its own random Yjs client id) instead
  of one, and the first one's cleanup didn't reliably reach the server before the second
  connected. Fixed with the standard pattern for this class of bug — caching the provider per
  document and delaying teardown by one tick, cancelled if the same document is re-acquired before
  the tick fires — then re-verified with the same two-tab live test plus repeated reloads to
  confirm the fix, not just that the error disappeared.

## How I verified correctness, UX quality, and reliability

- **Live browser verification, not just compilation.** Every feature (auth, CRUD, formatting
  persistence, sharing enforcement, upload, delete) was exercised through the actual rendered app
  in Chrome — logging in as different seeded users, checking what each one is and isn't allowed
  to do, and reloading to confirm persistence — rather than trusting that TypeScript compiling
  meant the feature worked.
- **Multi-user permission testing.** Sharing was checked from both sides: as the owner (granting
  access, seeing the share list), and as the recipient (confirming the toolbar disables, the
  Share button disappears, and — this is the part that actually matters — that a write attempt is
  rejected by the server, not just hidden by the UI).
- **Targeted unit tests over coverage numbers.** Two suites, chosen deliberately: the
  access-control resolver (owner / view-share / edit-share / no-access / missing-document) and
  the markdown/text converter (headings, inline marks, list grouping, and that plain text is
  never interpreted as markdown). These are the two places a bug would be easy to introduce and
  hard to notice by eye — not the largest possible number of tests, the ones that actually reduce
  risk.
- **Cleanup discipline.** Every document created for a manual test during this session (via curl,
  via file upload, via the delete-flow check) was deleted afterward and the database re-seeded, so
  the repository and its seed data are in the same state a reviewer would find on a fresh clone —
  verified by diffing the seeded user's document list against expectations after each pass.
- **Multi-tab live collaboration testing, both directions.** The real-time editing feature was
  verified with two actual browser tabs signed in as two different seeded users on the same
  document at once: typing in one tab and confirming the text (and the other user's named,
  colored cursor) appeared in the other tab without any reload, in both directions, plus that the
  content was correctly persisted to Postgres after both tabs closed.
- **Verified the collaboration access boundary below the UI, at the protocol itself.** Beyond
  confirming the client never opens a socket for view-only access, the actual WebSocket upgrade
  handshake was tested directly with raw HTTP requests (bypassing the UI and the JS client
  entirely): an unauthenticated request got `401`, a view-only user's request got `403`, and an
  edit-access user's request got `101 Switching Protocols` — confirming the server enforces this
  itself rather than trusting the client to behave.
