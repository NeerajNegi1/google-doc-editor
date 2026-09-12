import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";

type ShareRow = {
  id: string;
  permission: "VIEW" | "EDIT";
  user: { id: string; name: string; email: string };
};

export default function ShareDialog({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api
      .get<ShareRow[]>(`/documents/${documentId}/shares`)
      .then(setShares)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  };

  useEffect(load, [documentId]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/documents/${documentId}/shares`, { email, permission });
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await api.delete(`/documents/${documentId}/shares/${userId}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove access");
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Share document</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <form onSubmit={handleShare} className="mb-5 flex gap-2">
          <input
            type="email"
            required
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as "VIEW" | "EDIT")}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          >
            <option value="VIEW">Can view</option>
            <option value="EDIT">Can edit</option>
          </select>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Share
          </button>
        </form>

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          People with access
        </h3>
        <ul className="space-y-2">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>
                {s.user.name} <span className="text-gray-400">({s.user.email})</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {s.permission === "EDIT" ? "Can edit" : "Can view"}
                </span>
                <button
                  onClick={() => handleRemove(s.user.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {shares.length === 0 && <li className="text-sm text-gray-400">Not shared with anyone yet.</li>}
        </ul>
      </div>
    </div>
  );
}
