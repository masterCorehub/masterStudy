import { ErrorBoundary } from "./components/ErrorBoundary";

import { lazy, Suspense, useEffect, useState } from "react";
import { useStudyStore } from "./store/useStore";
import { AccountScreen } from "./screens/AccountScreen";
import {
  collaborationCloud,
  collaborationCloudConfigured,
} from "./services/collaboration-cloud";

const PdfGuidedReadingModal = lazy(() =>
  import("./features/pdf-guided/PdfGuidedReadingModal"),
);
const TranslatorPopup = lazy(() =>
  import("./features/translator/TranslatorPopup").then((module) => ({
    default: module.TranslatorPopup || module.default,
  })),
);
const CaptureOverlay = lazy(() =>
  import("./features/translator/CaptureOverlay").then((module) => ({
    default: module.CaptureOverlay || module.default,
  })),
);
const AppShell = lazy(() =>
  import("./app/AppShell").then((module) => ({ default: module.AppShell })),
);

function AppLoadingScreen({ message = "Preparando seu espaço…" }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[color:var(--primary)] text-[color:var(--on-primary)] shadow-sm">
          <span className="material-symbols-outlined text-[28px]">school</span>
        </div>
        <div className="mx-auto mt-5 h-1.5 w-36 overflow-hidden rounded-full bg-[color:var(--surface-container-high)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[color:var(--primary)]" />
        </div>
        <p className="mt-3 text-sm font-bold text-[color:var(--on-surface-variant)]">
          {message}
        </p>
      </div>
    </div>
  );
}

export function App() {
  const isDarkMode = useStudyStore((state) => state.isDarkMode);
  const themePreference = useStudyStore((state) => state.themePreference || "system");
  const [authState, setAuthState] = useState({
    loading: collaborationCloudConfigured,
    session: null,
  });
  const guidedReadingPreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("guided-reading-preview") === "1";
  const utilityScreen = new URLSearchParams(window.location.search).get("screen");
  const authMode = new URLSearchParams(window.location.search).get("auth");

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const isSystem = themePreference === "system";
      const resolvedDark = isSystem
        ? Boolean(media?.matches)
        : [
            "dark",
            "midnight-oled",
            "dracula",
            "catppuccin-mocha",
            "tokyo-night",
            "nord",
            "matcha-forest",
            "rose-pine",
            "cyber-matrix",
          ].includes(themePreference);

      const activeThemeAttr = isSystem
        ? resolvedDark
          ? "dark"
          : "light"
        : themePreference;

      document.documentElement.setAttribute("data-theme", activeThemeAttr);
      document.documentElement.classList.toggle("dark", resolvedDark);
      document.documentElement.style.colorScheme = resolvedDark ? "dark" : "light";
    };
    applyTheme();
    if (themePreference !== "system" || !media) return undefined;
    media.addEventListener?.("change", applyTheme);
    return () => media.removeEventListener?.("change", applyTheme);
  }, [themePreference, isDarkMode]);

  useEffect(() => {
    if (!collaborationCloudConfigured) {
      setAuthState({ loading: false, session: null });
      return undefined;
    }

    let mounted = true;
    const authTimeout = window.setTimeout(() => {
      if (mounted) setAuthState({ loading: false, session: null });
    }, 8000);
    collaborationCloud
      .getSession()
      .then((session) => {
        window.clearTimeout(authTimeout);
        if (mounted) setAuthState({ loading: false, session });
      })
      .catch(() => {
        window.clearTimeout(authTimeout);
        if (mounted) setAuthState({ loading: false, session: null });
      });

    const unsubscribe = collaborationCloud.onAuthStateChange((session) => {
      window.clearTimeout(authTimeout);
      if (mounted) setAuthState({ loading: false, session });
    });

    return () => {
      mounted = false;
      window.clearTimeout(authTimeout);
      unsubscribe?.();
    };
  }, []);

  if (authState.loading) {
    return <AppLoadingScreen message="Verificando sua conta…" />;
  }

  if (!authState.session || authMode === "recovery") {
    return (
      <ErrorBoundary>
        <AccountScreen required recovery={authMode === "recovery"} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {utilityScreen === "translator" ? (
        <Suspense fallback={null}>
          <TranslatorPopup />
        </Suspense>
      ) : utilityScreen === "translator_capture" ? (
        <Suspense
          fallback={
            <div className="min-h-screen bg-black" aria-label="Preparando captura" />
          }
        >
          <CaptureOverlay />
        </Suspense>
      ) : guidedReadingPreview ? (
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-[#f0f1f7] font-bold text-[#7c3aed]">
              Preparando leitura guiada...
            </div>
          }
        >
          <PdfGuidedReadingModal
            pdfPath="/qa-guided-reading.pdf"
            pdfTitle="O ciclo da água"
            onClose={() => window.location.assign("/")}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<AppLoadingScreen />}>
          <AppShell />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}
