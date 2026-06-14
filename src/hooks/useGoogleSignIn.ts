import { useEffect, useState, type RefObject } from "react";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GsiInitConfig {
  client_id: string;
  callback: (response: { credential: string }) => void;
  use_fedcm_for_button?: boolean;
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

interface UseGoogleSignInOptions {
  googleEnabled: boolean;
  step: string;
  btnRef: RefObject<HTMLDivElement | null>;
  onFinish: (provider: "google", credential?: string) => Promise<void>;
}

export function useGoogleSignIn({ googleEnabled, step, btnRef, onFinish }: UseGoogleSignInOptions) {
  const [googleFailed, setGoogleFailed] = useState(false);
  const showGoogle = googleEnabled && Boolean(GOOGLE_CLIENT_ID) && !googleFailed;

  useEffect(() => {
    if (step !== "signin" || !showGoogle) return;
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google || !btnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID as string,
          callback: (response) => void onFinish("google", response.credential),
          use_fedcm_for_button: false,
          itp_support: true,
        });
        btnRef.current.replaceChildren();
        window.google.accounts.id.renderButton(btnRef.current, {
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
    // onFinish is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showGoogle]);

  return { showGoogle };
}
