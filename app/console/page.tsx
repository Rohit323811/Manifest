"use client";

import Image from "next/image";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const INSPIRATIONS = [
  "portrait in moonlight",
  "cyberpunk girl in rain",
  "ethereal forest spirit",
  "cinematic close-up",
];

function getLoadingMessage(progress: number) {
  if (progress <= 20) return "Booting neural link...";
  if (progress <= 40) return "Adjusting lighting using NASA camera...";
  if (progress <= 60) return "Consulting the ancient spirits...";
  if (progress <= 80) return "Calibrating stoner frequency...";
  if (progress < 100) return "Perfecting the pixels. Almost there...";
  return "Manifestation complete.";
}

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");
  const [showLoadingBar, setShowLoadingBar] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const wasLoadingRef = useRef(false);
  const generationSucceededRef = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      wasLoadingRef.current = true;
      setShowLoadingBar(true);
      setLoadingProgress(0);
      setLoadingText(getLoadingMessage(0));
      interval = setInterval(() => {
        setLoadingProgress((current) => {
          const next = Math.min(99, current + Math.floor(Math.random() * 5) + 1);
          setLoadingText(getLoadingMessage(next));
          return next;
        });
      }, 300);
    } else if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setLoadingProgress(100);
      setLoadingText(generationSucceededRef.current ? getLoadingMessage(100) : "Generation interrupted. Please try again.");
      setShowLoadingBar(true);
      generationSucceededRef.current = false;
      hideTimeout = setTimeout(() => setShowLoadingBar(false), 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [loading]);

  useEffect(() => {
    let active = true;
    const client = supabase;

    if (!client) {
      setAuthLoading(false);
      setAuthError("Supabase is not configured. Add the required public environment variables and restart the app.");
      router.replace("/login");
      return () => {
        active = false;
      };
    }

    const syncSession = async (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setCredits(null);
      setAuthError("");

      if (!nextSession) {
        setAuthLoading(false);
        router.replace("/login");
        return;
      }

      setAuthLoading(true);
      try {
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("credits")
          .eq("id", nextSession.user.id)
          .maybeSingle();
        if (profileError || !profile || typeof profile.credits !== "number") {
          throw new Error("Could not load your credits. Check that the profiles table is configured.");
        }
        if (active) setCredits(profile.credits);
      } catch (creditError) {
        if (active) {
          setAuthError(creditError instanceof Error ? creditError.message : "Could not load your credits.");
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (active) {
          setAuthError("Could not restore your sign-in session. Please sign in again.");
          setAuthLoading(false);
        }
        return;
      }
      void syncSession(data.session);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setAuthError("Could not sign out. Please try again.");
  };

  const handlePayment = async () => {
    if (!session) {
      setError("Sign in before buying credits.");
      return;
    }

    setPaymentLoading(true);
    setError("");

    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ userId: session.user.id }),
      });
      const result = (await response.json()) as { short_url?: string; error?: string };

      if (!response.ok || typeof result.short_url !== "string") {
        throw new Error(result.error ?? "Could not start the payment. Please try again.");
      }

      window.location.href = result.short_url;
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not start the payment. Please try again.");
      setPaymentLoading(false);
    }
  };

  const downloadImage = (image: string) => {
    const link = document.createElement("a");
    link.href = image;
    link.download = "manifest-art.jpg";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    if (authLoading) return;
    if (!supabase) {
      setError("Authentication is not configured.");
      return;
    }

    const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !currentSession) {
      router.push("/login");
      return;
    }
    setSession(currentSession);
    if (credits === null || credits < 5) {
      setError("You need at least 5 credits to generate an image.");
      return;
    }

    generationSucceededRef.current = false;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ prompt }),
      });
      const responseText = await response.text();
      let result: { images?: string[]; error?: string };

      try {
        result = JSON.parse(responseText) as { images?: string[]; error?: string };
      } catch {
        const isHtml = responseText.trimStart().startsWith("<");
        throw new Error(
          isHtml
            ? `The generation API returned an HTML page (HTTP ${response.status}). Restart Next.js from C:\\Projects\\manifest and try again.`
            : `The generation API returned an invalid response (HTTP ${response.status}). Try again.`,
        );
      }

      if (!response.ok) throw new Error(result.error ?? "Generation failed. Please try again.");
      const nextImages = result.images ?? [];
      if (nextImages.length === 0) throw new Error("No images were returned. Try another prompt.");

      if (!supabase) throw new Error("Supabase is not configured.");
      const newCredits = credits - 5;
      const { data: updatedProfile, error: updateError } = await supabase
        .from("profiles")
        .update({ credits: newCredits })
        .eq("id", currentSession.user.id)
        .eq("credits", credits)
        .select("credits")
        .maybeSingle();
      if (updateError || !updatedProfile || typeof updatedProfile.credits !== "number") {
        throw new Error("Could not update your credits. Refresh your balance and try again.");
      }

      setCredits(updatedProfile.credits);
      setImages((current) => [...nextImages, ...current]);
      generationSucceededRef.current = true;
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
      <main className="relative min-h-screen overflow-x-clip bg-[#050505] text-zinc-300">
      <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="group flex items-center gap-3" aria-label="Manifest home">
            <Image src="/manifest.jpg?v=2" alt="Manifest logo" width={40} height={40} className="h-10 w-10 object-contain" priority />
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="font-sans text-sm font-black tracking-[0.24em] text-white">MANIFEST</span>
              </span>
              <span className="text-[8px] tracking-[0.18em] text-zinc-500">AI IMAGE STUDIO</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="hidden text-[9px] tracking-[0.12em] text-zinc-400 sm:inline">{credits ?? "…"} CREDITS</span>
                <button type="button" onClick={handleSignOut} className="border border-zinc-800 px-3 py-3 text-[10px] font-bold tracking-[0.12em] text-zinc-300 transition hover:border-zinc-600 hover:text-white">SIGN OUT</button>
              </>
            ) : (
              <Link href="/login" className="border border-zinc-800 px-3 py-3 text-[10px] font-bold tracking-[0.12em] text-zinc-300 transition hover:border-zinc-600 hover:text-white">SIGN IN</Link>
            )}
            <Link href="/console" className="group inline-flex items-center gap-3 border border-zinc-800/80 bg-zinc-900 px-4 py-3 text-[10px] font-bold tracking-[0.16em] text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-200 hover:text-black sm:px-5">GET STARTED <span className="transition-transform group-hover:translate-x-1">↗</span></Link>
          </div>
        </div>
      </nav>

      {authLoading ? (
        <section className="flex min-h-[calc(100svh-76px)] items-center justify-center px-6 text-sm text-zinc-400" role="status">AUTHENTICATING...</section>
      ) : session ? <div className="view-enter">
      <section id="prompt-console" className="relative border-y border-zinc-800 bg-[#080808] px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-end justify-between gap-4 border-b border-zinc-800 pb-6">
            <div>
              <p className="mb-3 text-[9px] font-semibold tracking-[0.24em] text-zinc-500">PROMPT CONSOLE <span className="text-zinc-400">/</span> 01</p>
              <h2 className="font-sans text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Describe IT, IT appears.</h2>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">
            <label htmlFor="prompt-input" className="sr-only">Describe the image you want to generate</label>
            <textarea
              ref={promptRef}
              id="prompt-input"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setError("");
              }}
              placeholder="A portrait in moonlight, silver hair, soft film grain..."
              rows={4}
              maxLength={1000}
              className="w-full resize-y rounded-xl border-0 bg-zinc-900 p-5 text-lg leading-7 text-white outline-none placeholder:text-zinc-500 focus:ring-0"
            />
          </div>

          {showLoadingBar && (
            <div aria-live="polite" className="mt-4">
              <div className="mt-2 flex justify-between text-sm text-zinc-400">
                <span>{loadingText}</span>
                <span>{loadingProgress}%</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-white transition-all duration-300 ease-out"
                  style={{ width: loadingProgress + "%" }}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {INSPIRATIONS.map((idea) => (
              <button key={idea} type="button" onClick={() => { setPrompt(idea); setError(""); }} className="border border-zinc-800 bg-zinc-900/10 px-3 py-2 text-[10px] tracking-[0.04em] text-zinc-500 transition hover:border-zinc-500 hover:bg-zinc-200/[0.06] hover:text-white">+ {idea}</button>
            ))}
          </div>

          <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-zinc-800 pt-6 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs tracking-[0.1em] text-zinc-400">
                {authLoading ? "LOADING PROFILE..." : credits === null ? "CREDITS UNAVAILABLE" : `CREDITS REMAINING: ${credits}`}
              </p>
              {authError && <p className="mt-2 border border-red-900 bg-red-950/30 p-2 font-sans text-sm text-red-500" role="alert">{authError}</p>}
              {error && <p className="mt-2 border border-red-900 bg-red-950/30 p-2 font-sans text-sm text-red-500" role="alert">{error}</p>}
            </div>
            {session && credits !== null && credits < 5 ? (
              <button type="button" onClick={handlePayment} disabled={paymentLoading} className="inline-flex min-h-12 min-w-56 items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60">
                {paymentLoading ? "CREATING PAYMENT LINK..." : "Buy 25 Credits for ₹100"}
              </button>
            ) : (
            <button type="button" onClick={handleGenerate} disabled={loading || authLoading || !prompt.trim() || credits === null || credits < 5} className="inline-flex min-h-12 min-w-44 items-center justify-center gap-3 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">
                {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />}
                {loading ? "MANIFESTING..." : "GENERATE IMAGE"}
              </button>
            )}
          </div>
        </div>
      </section>

      {images.length > 0 && (
        <section aria-label="Generated images" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <div className="mb-8 flex items-center gap-4"><span className="text-[10px] tracking-[0.24em] text-zinc-500">OUTPUT / {String(images.length).padStart(2, "0")}</span><span className="h-px flex-1 bg-zinc-900" /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => (
              <figure key={index} className="relative group rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                <div className="relative aspect-square">
                  <Image src={image} alt={"AI generated image " + (index + 1)} width={768} height={768} unoptimized className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <div className="absolute bottom-4 left-4 flex items-center gap-4">
                      <button type="button" onClick={() => downloadImage(image)} className="flex items-center gap-1 text-sm text-white transition hover:text-zinc-300" aria-label="Download image">
                        <span aria-hidden="true">↓</span> Download
                      </button>
                      <button type="button" onClick={() => setFullscreenImage(image)} className="flex items-center gap-1 text-sm text-white transition hover:text-zinc-300" aria-label="View image full screen">
                        <span aria-hidden="true">⛶</span> Full Screen
                      </button>
                    </div>
                  </div>
                </div>
                <figcaption className="border-t border-zinc-800 px-3 py-3 text-xs tracking-wide text-zinc-500">RENDER {String(index + 1).padStart(3, "0")}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {fullscreenImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen generated image"
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/90 p-4"
        >
          <button
            type="button"
            aria-label="Close fullscreen image"
            onClick={() => setFullscreenImage(null)}
            className="absolute right-4 top-4 text-2xl font-bold text-zinc-300 transition hover:text-white"
          >
            ×
          </button>
          <Image
            src={fullscreenImage}
            alt="Fullscreen generated image"
            width={1600}
            height={1600}
            unoptimized
            onClick={(event) => event.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
      </div> : null}

      <footer className="border-t border-zinc-800 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs tracking-wide text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">MANIFEST — AI IMAGE GENERATION</span>
          <span>© 2026 Monism. All rights reserved.</span>
          <div className="flex gap-6"><Link href="/pricing" className="text-zinc-300 transition hover:text-white">PRICING</Link><Link href="/terms" className="text-zinc-300 transition hover:text-white">TERMS</Link></div>
        </div>
      </footer>
    </main>
  );
}









