"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Mic, Plus, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import clsx from "clsx";

type User = {
  id: string;
  name: string;
  email: string;
};

type Interview = {
  id: string;
  role: string;
  level: string;
  language: "English" | "Hindi" | "Hinglish";
  focus: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  score: number | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  createdAt: string;
  _count?: { turns: number };
};

const levels = ["Junior", "Mid-level", "Senior"] as const;
const languages = ["English", "Hindi", "Hinglish"] as const;

export function HomeClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState("Frontend Engineer");
  const [level, setLevel] = useState<(typeof levels)[number]>("Mid-level");
  const [language, setLanguage] = useState<(typeof languages)[number]>("English");
  const [focus, setFocus] = useState("React architecture, debugging, collaboration, and product judgement");

  const completed = useMemo(() => interviews.filter((item) => item.status === "COMPLETED"), [interviews]);

  useEffect(() => {
    async function boot() {
      const me = await fetch("/api/auth/me").then((res) => res.json());
      setUser(me.user);
      if (me.user) {
        await loadInterviews();
      }
      setLoading(false);
    }

    void boot();
  }, []);

  async function loadInterviews() {
    const data = await fetch("/api/interviews").then((res) => res.json());
    setInterviews(data.interviews || []);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };

    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authMode === "login" ? { email: payload.email, password: payload.password } : payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setAuthError(data.error || "Authentication failed.");
      return;
    }

    setUser(data.user);
    await loadInterviews();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setInterviews([]);
  }

  async function createInterview(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    const response = await fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, level, language, focus }),
    });
    const data = await response.json();
    setCreating(false);
    if (response.ok) {
      router.push(`/interview/${data.interview.id}`);
    }
  }

  if (loading) {
    return (
      <main className="center-screen">
        <div className="pulse-orb" />
        <p>Loading Mentorque</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-copy">
          <div className="brand-mark">
            <Mic size={22} />
            <span>Mentorque</span>
          </div>
          <h1>Practice the interview out loud.</h1>
          <p>
            A realtime AI interviewer listens, adapts, follows up, and creates a scorecard from the full conversation.
          </p>
          <div className="trust-row">
            <span><ShieldCheck size={16} /> JWT auth</span>
            <span><Sparkles size={16} /> Dynamic voice loop</span>
          </div>
        </section>

        <section className="auth-panel" aria-label="Authentication">
          <div className="segmented">
            <button className={clsx(authMode === "signup" && "active")} onClick={() => setAuthMode("signup")}>
              Sign up
            </button>
            <button className={clsx(authMode === "login" && "active")} onClick={() => setAuthMode("login")}>
              Log in
            </button>
          </div>
          <form onSubmit={submitAuth} className="stack">
            {authMode === "signup" && (
              <label>
                Name
                <input name="name" autoComplete="name" placeholder="Sahil Kumar" required />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="primary-button" type="submit">
              <UserRound size={18} />
              {authMode === "signup" ? "Create account" : "Enter dashboard"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark compact">
          <Mic size={20} />
          <span>Mentorque</span>
        </div>
        <div className="user-menu">
          <span>{user.name}</span>
          <button className="icon-button" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <form className="setup-panel" onSubmit={createInterview}>
          <div>
            <p className="eyebrow">New mock interview</p>
            <h1>Start a focused voice session</h1>
          </div>
          <label>
            Role
            <input value={role} onChange={(event) => setRole(event.target.value)} />
          </label>
          <label>
            Seniority
            <select value={level} onChange={(event) => setLevel(event.target.value as (typeof levels)[number])}>
              {levels.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Interview language
            <select value={language} onChange={(event) => setLanguage(event.target.value as (typeof languages)[number])}>
              {languages.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Focus area
            <textarea value={focus} onChange={(event) => setFocus(event.target.value)} rows={4} />
          </label>
          <button className="primary-button" type="submit" disabled={creating}>
            <Plus size={18} />
            {creating ? "Creating..." : "Enter voice room"}
          </button>
        </form>

        <section className="history-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Scorecards</p>
              <h2>Recent interviews</h2>
            </div>
            <span>{completed.length} completed</span>
          </div>

          <div className="interview-list">
            {interviews.length === 0 && <p className="empty-state">Your completed scorecards will appear here.</p>}
            {interviews.map((item) => (
              <article className="interview-card" key={item.id}>
                <div>
                  <strong>{item.role}</strong>
                  <p>{item.level} • {item.language} • {item.focus}</p>
                </div>
                <div className="card-actions">
                  <span className={clsx("status-pill", item.status.toLowerCase())}>
                    {item.score ?? item.status}
                  </span>
                  {item.status !== "COMPLETED" && (
                    <button className="ghost-button" onClick={() => router.push(`/interview/${item.id}`)}>
                      Resume <ArrowRight size={16} />
                    </button>
                  )}
                </div>
                {item.summary && <p className="summary">{item.summary}</p>}
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
