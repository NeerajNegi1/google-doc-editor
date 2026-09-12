import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/apiClient";
import { useAuth } from "../lib/AuthContext";
import UploadDialog from "../components/UploadDialog";

type OwnedDoc = { id: string; title: string; updatedAt: string; createdAt: string };
type SharedDoc = OwnedDoc & { permission: "VIEW" | "EDIT"; ownerName: string };
type DocLists = { owned: OwnedDoc[]; shared: SharedDoc[] };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function DocumentListPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocLists>({ owned: [], shared: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<DocLists>("/documents/")
      .then(setDocs)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const doc = await api.post<{ id: string }>("/documents/", { title: "Untitled document" });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/documents/${id}`);
      setPendingDeleteId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-gray-50 px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Docs</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button onClick={() => logout()} className="text-sm text-gray-500 hover:text-gray-800">
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div className="mb-8 flex gap-3">
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ New document"}
        </button>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Upload document
        </button>
      </div>

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onImported={(id) => navigate(`/documents/${id}`)}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              My Documents
            </h2>
            {docs.owned.length === 0 && (
              <p className="text-sm text-gray-400">No documents yet — create one above.</p>
            )}
            <ul className="space-y-2">
              {docs.owned.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-3"
                >
                  <button
                    onClick={() => navigate(`/documents/${doc.id}`)}
                    className="flex-1 text-left"
                  >
                    <span className="block text-sm font-medium text-gray-900">{doc.title}</span>
                    <span className="block text-xs text-gray-500">
                      Owned by you · updated {formatDate(doc.updatedAt)}
                    </span>
                  </button>
                  {pendingDeleteId === doc.id ? (
                    <span className="ml-4 flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Delete?</span>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setPendingDeleteId(doc.id)}
                      className="ml-4 text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Shared with me
            </h2>
            {docs.shared.length === 0 && (
              <p className="text-sm text-gray-400">Nothing has been shared with you yet.</p>
            )}
            <ul className="space-y-2">
              {docs.shared.map((doc) => (
                <li key={doc.id} className="rounded-md border border-gray-200 bg-white px-4 py-3">
                  <button onClick={() => navigate(`/documents/${doc.id}`)} className="w-full text-left">
                    <span className="block text-sm font-medium text-gray-900">{doc.title}</span>
                    <span className="block text-xs text-gray-500">
                      Shared by {doc.ownerName} · {doc.permission === "EDIT" ? "can edit" : "view only"} ·
                      updated {formatDate(doc.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
