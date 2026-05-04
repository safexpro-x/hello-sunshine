// Firebase Web SDK loader. Config is fetched at runtime from the
// `firebase-public-config` edge function (admin-managed in DB), so the admin
// can change Firebase project keys anytime without redeploying the frontend.
//
// Falls back to VITE_FIREBASE_* env vars for local dev.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { supabase } from "@/integrations/supabase/client";

export type FirebasePublicConfig = {
  enabled: boolean;
  project_id: string;
  api_key: string;
  auth_domain: string;
  app_id: string;
};

let _cache: FirebasePublicConfig | null = null;
let _inflight: Promise<FirebasePublicConfig> | null = null;

export async function loadFirebaseConfig(force = false): Promise<FirebasePublicConfig> {
  if (!force && _cache) return _cache;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("firebase-public-config", {
        method: "GET",
      });
      if (!error && data && typeof data === "object") {
        _cache = data as FirebasePublicConfig;
        return _cache;
      }
    } catch {
      /* swallow — fall through to env */
    }
    // Fallback: env vars
    const envCfg: FirebasePublicConfig = {
      enabled: !!import.meta.env.VITE_FIREBASE_API_KEY,
      project_id: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
      api_key: import.meta.env.VITE_FIREBASE_API_KEY || "",
      auth_domain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      app_id: import.meta.env.VITE_FIREBASE_APP_ID || "",
    };
    _cache = envCfg;
    return envCfg;
  })();

  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

export async function isFirebaseReady(): Promise<boolean> {
  const cfg = await loadFirebaseConfig();
  return !!(cfg.enabled && cfg.api_key && cfg.project_id && cfg.app_id);
}

let _app: FirebaseApp | null = null;
async function ensureApp(): Promise<FirebaseApp> {
  const cfg = await loadFirebaseConfig();
  if (!cfg.enabled || !cfg.api_key || !cfg.project_id || !cfg.app_id) {
    throw new Error(
      "Firebase Google sign-in is not configured yet. Admin must set it in Admin → Firebase.",
    );
  }
  if (_app) return _app;
  _app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: cfg.api_key,
        authDomain: cfg.auth_domain || `${cfg.project_id}.firebaseapp.com`,
        projectId: cfg.project_id,
        appId: cfg.app_id,
      });
  return _app;
}

export async function signInWithGoogleFirebase(): Promise<{
  idToken: string;
  user: FirebaseUser;
}> {
  const app = await ensureApp();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken(true);
  return { idToken, user: result.user };
}

export async function firebaseSignOut() {
  try {
    const cfg = await loadFirebaseConfig();
    if (!cfg.enabled) return;
    const app = await ensureApp();
    await fbSignOut(getAuth(app));
  } catch {
    /* ignore */
  }
}
