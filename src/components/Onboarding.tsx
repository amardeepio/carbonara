"use client";

import { useEffect, useRef, useState } from "react";
import { COMMUTE_OPTIONS, DIET_OPTIONS } from "@/components/profileOptions";
import { INDIAN_STATES, type IndianState } from "@/lib/grid";
import type { CommuteMode, DietPreference, SafeUser } from "@/lib/types";

interface Props {
  /** Whether the server has a Google client id configured. */
  googleEnabled: boolean;
  /** Returning visitor (already onboarded once): jump straight to sign-in. */
  returning?: boolean;
  onComplete: (user: SafeUser) => void;
}

const STEPS = ["welcome", "name", "commute", "diet", "state", "signin"] as const;
type Step = (typeof STEPS)[number];

const GSI_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GsiInitConfig {
  client_id: string;
  callback: (response: { credential: string }) => void;
  /** Use the classic popup flow — FedCM dialogs are unreliable in embedded/emulated contexts. */
  use_fedcm_for_button?: boolean;
  /** Better behaviour under Safari/iOS Intelligent Tracking Prevention. */
  itp_support?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiInitConfig) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/** Load the Google Identity Services script once. */
function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GSI failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GSI failed to load"));
    document.head.appendChild(script);
  });
}

/**
 * Mobile-first onboarding: a short, swipe-feel stepper (welcome → name →
 * commute → diet) ending in "Continue with Google" / "Continue as guest".
 * Every profile question is skippable; answers personalize the assistant.
 */
export default function Onboarding({ googleEnabled, returning = false, onComplete }: Props) {
  // Returning visitors land on the sign-in step; the back arrow still lets
  // them walk through the profile steps again if they want to.
  const [stepIndex, setStepIndex] = useState(returning ? STEPS.length - 1 : 0);
  // True when the user tapped "Already have an account?" on the welcome step.
  const [skippedToSignIn, setSkippedToSignIn] = useState(false);
  const [name, setName] = useState("");
  const [commute, setCommute] = useState<CommuteMode | null>(null);
  const [diet, setDiet] = useState<DietPreference | null>(null);
  const [state, setState] = useState<IndianState | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const step: Step = STEPS[stepIndex] ?? "welcome";
  const showGoogle = googleEnabled && Boolean(GOOGLE_CLIENT_ID) && !googleFailed;

  // Move focus to the step heading on change so screen readers follow along.
  useEffect(() => {
    if (stepIndex > 0) headingRef.current?.focus();
  }, [stepIndex]);

  // Render the official Google button when the sign-in step appears.
  useEffect(() => {
    if (step !== "signin" || !showGoogle) return;
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID as string,
          callback: (response) => void finish("google", response.credential),
          use_fedcm_for_button: false,
          itp_support: true,
        });
        googleBtnRef.current.replaceChildren();
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 280,
        });
      })
      .catch(() => setGoogleFailed(true));
    return () => {
      cancelled = true;
    };
    // finish is stable for the lifetime of this flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showGoogle]);

  function next() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function back() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function finish(provider: "google" | "guest", credential?: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const profile = {
      name: name.trim() || undefined,
      commute: commute ?? undefined,
      diet: diet ?? undefined,
      state: state || undefined,
    };

    try {
      const res = await fetch(`/api/auth/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider === "google" ? { credential, profile } : { profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign-in failed. Please try again.");
      onComplete(data.user as SafeUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  }

  const firstName = name.trim().split(/\s+/)[0];

  return (
    <main className="onboarding" aria-label="Get started with Carbonara">
      <div className="onb-card">
        <header className="onb-head">
          {stepIndex > 0 ? (
            <button type="button" className="onb-back" onClick={back} aria-label="Go back">
              ←
            </button>
          ) : (
            <span className="onb-back-placeholder" aria-hidden="true" />
          )}
          <div className="onb-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s} className={`onb-dot ${i === stepIndex ? "active" : ""}`} />
            ))}
          </div>
          <span className="visually-hidden" aria-live="polite">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </header>

        {/* key remounts the panel so the slide-in animation plays per step */}
        <div className="onb-panel" key={step}>
          {step === "welcome" && (
            <>
              <p className="onb-mark" aria-hidden="true">
                🌱
              </p>
              <h1 tabIndex={-1} ref={headingRef}>
                Welcome to Carbonara
              </h1>
              <p className="onb-lede">
                Your India-focused carbon coach. Understand your footprint and shrink it — one
                simple action at a time.
              </p>
              <ul className="onb-points">
                <li>
                  <span aria-hidden="true">📒</span> Log daily activities in seconds
                </li>
                <li>
                  <span aria-hidden="true">📊</span> Compare with India &amp; 1.5&nbsp;°C targets
                </li>
                <li>
                  <span aria-hidden="true">🤖</span> Get smart, personalized actions
                </li>
              </ul>
              <button type="button" className="primary onb-cta" onClick={next}>
                Get started
              </button>
              <button
                type="button"
                className="onb-link"
                onClick={() => {
                  setSkippedToSignIn(true);
                  setStepIndex(STEPS.length - 1);
                }}
              >
                Already have an account? <strong>Sign in</strong>
              </button>
            </>
          )}

          {step === "name" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <h1 tabIndex={-1} ref={headingRef}>
                What should we call you?
              </h1>
              <p className="onb-lede">Just for friendly messages — feel free to skip.</p>
              <label htmlFor="onb-name" className="visually-hidden">
                Your name (optional)
              </label>
              <input
                id="onb-name"
                type="text"
                value={name}
                maxLength={60}
                autoComplete="given-name"
                placeholder="Your name (optional)"
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="primary onb-cta">
                {name.trim() ? "Continue" : "Skip for now"}
              </button>
            </form>
          )}

          {step === "commute" && (
            <>
              <h1 tabIndex={-1} ref={headingRef}>
                How do you usually get around?
              </h1>
              <p className="onb-lede">We&apos;ll tune your travel tips to match.</p>
              <div className="onb-options" role="group" aria-label="Usual commute">
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
              <button type="button" className="primary onb-cta" onClick={next}>
                {commute ? "Continue" : "Skip for now"}
              </button>
            </>
          )}

          {step === "diet" && (
            <>
              <h1 tabIndex={-1} ref={headingRef}>
                What&apos;s on your plate most days?
              </h1>
              <p className="onb-lede">Food is a big slice of any footprint.</p>
              <div className="onb-options" role="group" aria-label="Usual diet">
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
              <button type="button" className="primary onb-cta" onClick={next}>
                {diet ? "Continue" : "Skip for now"}
              </button>
            </>
          )}

          {step === "state" && (
            <>
              <h1 tabIndex={-1} ref={headingRef}>
                Which state are you in?
              </h1>
              <p className="onb-lede">
                Electricity is priced with your regional grid — coal-heavy in the East, hydro-rich
                in the North East.
              </p>
              <label htmlFor="onb-state" className="visually-hidden">
                Your state or union territory (optional)
              </label>
              <select
                id="onb-state"
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
              <button type="button" className="primary onb-cta" onClick={next}>
                {state ? "Continue" : "Skip for now"}
              </button>
            </>
          )}

          {step === "signin" && (
            <>
              <h1 tabIndex={-1} ref={headingRef}>
                {returning || skippedToSignIn
                  ? "Welcome back!"
                  : firstName
                    ? `Nice to meet you, ${firstName}!`
                    : "You're all set!"}
              </h1>
              <p className="onb-lede">
                {returning || skippedToSignIn
                  ? "Sign back in to pick up where you left off — your history and preferences are saved with your account."
                  : "Sign in to keep your footprint history on every device, or jump straight in as a guest."}
              </p>

              <div className="onb-auth">
                {showGoogle && (
                  <>
                    <div
                      ref={googleBtnRef}
                      className="onb-google"
                      aria-label="Continue with Google"
                    />
                    <p className="onb-divider" aria-hidden="true">
                      <span>or</span>
                    </p>
                  </>
                )}

                <button
                  type="button"
                  className={`onb-cta ${showGoogle ? "secondary" : "primary"}`}
                  onClick={() => finish("guest")}
                  disabled={submitting}
                >
                  {submitting ? "Setting things up…" : "Continue as guest"}
                </button>
              </div>

              <p className="onb-fineprint">
                Guest data is tied to this browser. {showGoogle ? "Sign in with Google any time to keep it across devices. " : ""}
                No passwords, no spam — just your footprint.
              </p>
            </>
          )}

          <p className="status error" role="status" aria-live="polite">
            {error ?? ""}
          </p>
        </div>
      </div>
    </main>
  );
}
