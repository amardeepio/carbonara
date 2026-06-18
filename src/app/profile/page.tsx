"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COMMUTE_OPTIONS, DIET_OPTIONS } from "@/components/profileOptions";
import { INDIAN_STATES, type IndianState } from "@/lib/grid";
import type { CommuteMode, DietPreference, SafeUser } from "@/lib/types";

/** Profile page: view account details and edit name / commute / diet. */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [name, setName] = useState("");
  const [commute, setCommute] = useState<CommuteMode | null>(null);
  const [diet, setDiet] = useState<DietPreference | null>(null);
  const [state, setState] = useState<IndianState | "">("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (!d.user) {
          router.replace("/");
          return;
        }
        const u = d.user as SafeUser;
        setUser(u);
        setName(u.name);
        setCommute(u.commute ?? null);
        setDiet(u.diet ?? null);
        setState(u.state ?? "");
      })
      .catch(() => router.replace("/"));
  }, [router]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setStatus({ kind: "error", text: "Name can't be empty." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), commute, diet, state: state || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your profile.");
      setUser(data.user as SafeUser);
      setStatus({ kind: "ok", text: "Profile saved." });
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not save your profile.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
    }
  }

  if (!user) {
    return (
      <main className="page" aria-busy="true">
        <p className="muted">Loading your profile…</p>
      </main>
    );
  }

  const initial = (name.trim().charAt(0) || user.name.charAt(0) || "G").toUpperCase();

  return (
    <div className="shell">
      <header className="appbar">
        <div className="appbar-inner">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              🌱
            </span>
            <span className="brand-name">Carbonara</span>
          </Link>
          <Link className="back-link" href="/">
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main id="main" className="page profile-page">
        <section className="card" aria-labelledby="profile-heading">
          <div className="profile-head">
            <span className="avatar avatar-letter avatar-lg" aria-hidden="true">
              {initial}
            </span>
            <div>
              <h1 id="profile-heading">Your profile</h1>
              <p className="muted profile-provider">
                {user.provider === "google"
                  ? `Signed in with Google${user.email ? ` · ${user.email}` : ""}`
                  : "Guest account — data is tied to this browser"}
              </p>
            </div>
          </div>

          <form onSubmit={save}>
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              type="text"
              value={name}
              maxLength={60}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              required
            />

            <fieldset className="profile-fieldset">
              <legend>How do you usually get around?</legend>
              <div className="onb-options">
                {COMMUTE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="onb-option"
                    aria-pressed={commute === option.value}
                    onClick={() =>
                      setCommute((current) => (current === option.value ? null : option.value))
                    }
                  >
                    <span className="onb-option-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="onb-option-label">{option.label}</span>
                    <span className="onb-option-blurb">{option.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="profile-fieldset">
              <legend>What&apos;s on your plate most days?</legend>
              <div className="onb-options">
                {DIET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="onb-option"
                    aria-pressed={diet === option.value}
                    onClick={() =>
                      setDiet((current) => (current === option.value ? null : option.value))
                    }
                  >
                    <span className="onb-option-icon" aria-hidden="true">
                      {option.icon}
                    </span>
                    <span className="onb-option-label">{option.label}</span>
                    <span className="onb-option-blurb">{option.blurb}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="profile-state">State (sets your electricity grid)</label>
            <select
              id="profile-state"
              value={state}
              onChange={(e) => setState(e.target.value as IndianState | "")}
            >
              <option value="">Prefer not to say</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <p className="muted field-note">
              Used to price electricity with your regional grid instead of the national average.
            </p>

            <button type="submit" className="primary save-btn" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <p
              className={`status ${status?.kind === "error" ? "error" : ""}`}
              role="status"
              aria-live="polite"
            >
              {status?.text ?? ""}
            </p>
          </form>
        </section>

        <section className="card profile-signout" aria-label="Session">
          <div>
            <h2>Sign out</h2>
            <p className="muted">
              {user.provider === "google"
                ? "Your data stays with your Google account — sign back in any time."
                : "Heads up: guest data can't be recovered after signing out."}
            </p>
          </div>
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </section>
      </main>
    </div>
  );
}
