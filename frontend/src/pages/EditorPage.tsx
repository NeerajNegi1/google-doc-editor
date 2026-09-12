import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { api } from "../lib/apiClient";
import { useAuth } from "../lib/AuthContext";
import Toolbar from "../components/Toolbar";
import ShareDialog from "../components/ShareDialog";
import { colorForUser } from "../lib/cursorColor";
import { acquireCollabSession, releaseCollabSession } from "../lib/collabProvider";

const COLLAB_FIELD = "default";
const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

type DocumentDetail = {
  id: string;
  title: string;
  contentJson: JSONContent;
  access: "OWNER" | "EDIT" | "VIEW";
  owner: { id: string; name: string; email: string };
  updatedAt: string;
};

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [title, setTitle] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [peerCount, setPeerCount] = useState(0);
  const [collab, setCollab] = useState<{ ydoc: Y.Doc; provider: WebsocketProvider } | null>(null);

  const readOnly = doc ? doc.access === "VIEW" : true;
  const canCollaborate = doc ? doc.access === "OWNER" || doc.access === "EDIT" : false;

  useEffect(() => {
    if (!id) return;
    api
      .get<DocumentDetail>(`/documents/${id}`)
      .then((data) => {
        setDoc(data);
        setTitle(data.title);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load document"));
  }, [id]);

  // Live editing is only ever opened for OWNER/EDIT access — a view-only
  // collaborator never gets a socket, so the server-side access check
  // (backend/src/collab/server.ts) is the only place that boundary lives.
  useEffect(() => {
    if (!doc || !canCollaborate) {
      setCollab(null);
      return;
    }

    const { ydoc, provider } = acquireCollabSession(doc.id);
    setConnectionStatus(provider.wsconnected ? "connected" : "connecting");
    setPeerCount(Math.max(0, provider.awareness.getStates().size - 1));

    const handleStatus = ({ status }: { status: ConnectionStatus }) => setConnectionStatus(status);
    const handleAwarenessChange = () => {
      setPeerCount(Math.max(0, provider.awareness.getStates().size - 1));
    };
    provider.on("status", handleStatus);
    provider.awareness.on("change", handleAwarenessChange);

    setCollab({ ydoc, provider });

    return () => {
      provider.off("status", handleStatus);
      provider.awareness.off("change", handleAwarenessChange);
      releaseCollabSession(doc.id);
      setCollab(null);
    };
  }, [doc?.id, canCollaborate]);

  const editor = useEditor(
    collab
      ? {
          extensions: [
            // Yjs owns undo/redo once Collaboration is attached — Tiptap's
            // own history plugin would fight it for the same operations.
            StarterKit.configure({ history: false }),
            Underline,
            Collaboration.configure({ document: collab.ydoc, field: COLLAB_FIELD }),
            CollaborationCursor.configure({
              provider: collab.provider,
              user: { name: user?.name ?? "Anonymous", color: colorForUser(user?.id ?? "") },
            }),
          ],
          editable: true,
        }
      : {
          extensions: [StarterKit, Underline],
          content: doc?.contentJson ?? emptyDoc,
          editable: false,
        },
    [collab, doc?.id, doc?.access]
  );

  const handleTitleBlur = async () => {
    if (!id || !doc || title === doc.title) return;
    if (!title.trim()) {
      setTitle(doc.title);
      return;
    }
    try {
      const updated = await api.patch<DocumentDetail>(`/documents/${id}`, { title: title.trim() });
      setDoc((prev) => (prev ? { ...prev, title: updated.title } : prev));
    } catch {
      setTitle(doc.title);
    }
  };

  if (loadError) {
    return (
      <div className="p-8">
        <p className="mb-4 text-sm text-red-600">{loadError}</p>
        <button onClick={() => navigate("/")} className="text-sm text-gray-600 underline">
          Back to documents
        </button>
      </div>
    );
  }

  if (!doc) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-sm text-gray-500 hover:text-gray-800">
            ← Docs
          </button>
          <input
            value={title}
            disabled={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="rounded px-2 py-1 text-lg font-medium text-gray-900 focus:bg-gray-100 focus:outline-none disabled:bg-transparent"
          />
        </div>
        <div className="flex items-center gap-4">
          {canCollaborate && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-green-500"
                    : connectionStatus === "connecting"
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
              />
              {connectionStatus === "connected" && (peerCount > 0 ? `Live · ${peerCount} editing` : "Live")}
              {connectionStatus === "connecting" && "Connecting…"}
              {connectionStatus === "disconnected" && "Offline"}
            </span>
          )}
          {doc.access === "OWNER" && (
            <button
              onClick={() => setShareOpen(true)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Share
            </button>
          )}
        </div>
      </header>

      <Toolbar editor={editor} readOnly={readOnly} />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <EditorContent editor={editor} className="rounded-md bg-white p-8 shadow-sm" />
      </main>

      {shareOpen && <ShareDialog documentId={doc.id} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
