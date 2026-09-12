import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/apiClient";
import { useAuth } from "../lib/AuthContext";

type SeededUser = { id: string; name: string; email: string };

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<SeededUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<SeededUser[]>("/auth/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogin = async (email: string) => {
    setError(null);
    setSubmitting(true);
    try {
      await login(email);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Docs</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in as a seeded user to continue.</p>

        {error && <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {users.map((u) => (
            <button
              key={u.id}
              disabled={submitting}
              onClick={() => handleLogin(u.email)}
              className="flex w-full items-center justify-between rounded-md border border-gray-200 px-4 py-3 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-gray-900">{u.name}</span>
                <span className="block text-xs text-gray-500">{u.email}</span>
              </span>
              <span className="text-xs text-gray-400">Sign in →</span>
            </button>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-gray-400">No seeded users found. Run the backend seed script.</p>
          )}
        </div>
      </div>
    </div>
  );
}
