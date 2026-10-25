"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setErrorMsg("Authentication is not configured. Please contact the site administrator.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (isLogin) {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        router.push("/console");
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/console` },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.push("/console");
          return;
        }
        setSuccessMsg("Account created! Please check your email to verify, or try logging in.");
        setIsLogin(true);
      }
    } catch (authError) {
      setErrorMsg(authError instanceof Error ? authError.message : "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      setErrorMsg("Authentication is not configured. Please contact the site administrator.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/console` },
    });

    if (signInError) {
      setErrorMsg("Google sign-in could not start. Check the authentication provider settings.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-8 font-sans text-zinc-100">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8 shadow-2xl shadow-black/40 sm:p-12">
        <p className="mb-5 text-xs tracking-[0.16em] text-zinc-500">MANIFEST / AUTH GATE</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {isLogin ? "SECURE ACCESS REQUIRED" : "INITIALIZE NEW IDENTITY"}
        </h1>
        <p className="mt-5 text-sm leading-7 text-zinc-400">
          Authentication required to initialize Manifest.
        </p>
        <form onSubmit={handleAuth} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-zinc-300">
            EMAIL
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full border border-zinc-800 bg-[#050505] px-4 py-3 text-sm text-zinc-400 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-300">
            PASSWORD
            <input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full border border-zinc-800 bg-[#050505] px-4 py-3 text-sm text-zinc-400 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
              placeholder="••••••••"
            />
          </label>
          {successMsg && <p role="status" className="mt-2 text-sm text-zinc-300">{successMsg}</p>}
          {errorMsg && <p role="alert" className="mt-2 text-sm text-red-500">{errorMsg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "AUTHENTICATING..." : isLogin ? "LOGIN" : "CREATE ACCOUNT"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsLogin((current) => !current);
            setErrorMsg("");
            setSuccessMsg("");
          }}
          className="mt-4 text-left text-sm text-zinc-400 underline transition hover:text-white"
        >
          {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-zinc-500" aria-hidden="true">
          <span className="h-px flex-1 bg-zinc-800" />
          <span>--- OR ---</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full rounded-full border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "CONNECTING..." : "Sign in with Google"}
        </button>
      </section>
      <footer className="mt-8 text-center text-xs text-zinc-500">
        © 2026 Monism. All rights reserved.
      </footer>
    </main>
  );
}
