"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export default function PricingPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleBuyCredits = async () => {
    if (!session) {
      router.push("/login");
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
        throw new Error(result.error || "Could not start the payment. Please try again.");
      }
      window.location.href = result.short_url;
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not start the payment. Please try again.");
      setPaymentLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] font-sans text-zinc-400">
      <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/manifest.jpg?v=2" alt="Manifest logo" width={40} height={40} className="h-10 w-10 object-contain" priority />
            <span className="flex items-center gap-2">
              <span className="font-sans text-sm font-black tracking-[0.24em] text-white">MANIFEST</span>
            </span>
          </Link>
          <Link href="/console" className="shrink-0 whitespace-nowrap border border-zinc-800 px-4 py-3 text-[10px] font-bold tracking-[0.14em] text-zinc-300 transition hover:border-zinc-500 hover:text-white">RETURN TO CONSOLE</Link>
        </div>
      </nav>

      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="text-[10px] font-bold tracking-[0.24em] text-zinc-400">MANIFEST / BILLING</p>
          <h1 className="mt-4 font-sans text-3xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">SYSTEM PRICING / CREDITS</h1>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
            <article className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/50 p-8">
              <p className="text-[10px] tracking-[0.2em] text-zinc-500">FREE TIER / 00</p>
              <h2 className="mt-4 text-xl font-bold tracking-[0.12em] text-white">INITIATE</h2>
              <p className="mt-6 font-sans text-5xl font-semibold tracking-tight text-white">₹0</p>
              <ul className="mt-8 space-y-4 border-t border-zinc-800 pt-6 text-sm text-zinc-300">
                <li><span className="mr-3 text-zinc-400">+</span>5 Free Credits</li>
                <li><span className="mr-3 text-zinc-400">+</span>1 Image Generation</li>
                <li><span className="mr-3 text-zinc-400">+</span>Standard Resolution</li>
              </ul>
              <button type="button" disabled className="mt-8 w-full rounded-lg border border-zinc-800 px-5 py-3 text-xs font-bold tracking-[0.15em] text-zinc-500 disabled:cursor-not-allowed">CURRENT PLAN</button>
            </article>

            <article className="relative overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/70 p-8 shadow-[0_0_40px_rgba(255,255,255,0.04)]">
              <div className="absolute right-0 top-0 h-32 w-32 bg-white/10 blur-3xl" />
              <p className="relative text-[10px] tracking-[0.2em] text-zinc-400">CREDIT BUNDLE / 01</p>
              <h2 className="relative mt-4 text-xl font-bold tracking-[0.12em] text-white">MANIFEST</h2>
              <p className="relative mt-6 font-sans text-5xl font-semibold tracking-tight text-white">₹100</p>
              <ul className="relative mt-8 space-y-4 border-t border-zinc-800 pt-6 text-sm text-zinc-200">
                <li><span className="mr-3 text-zinc-400">+</span>25 Credits</li>
                <li><span className="mr-3 text-zinc-400">+</span>5 Image Generations</li>
                <li><span className="mr-3 text-zinc-400">+</span>High Resolution</li>
                <li><span className="mr-3 text-zinc-400">+</span>No Watermark</li>
              </ul>
              <button type="button" onClick={handleBuyCredits} disabled={paymentLoading || authLoading} className="relative mt-8 w-full rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60">
                {paymentLoading ? "CREATING PAYMENT LINK..." : "BUY 25 CREDITS"}
              </button>
              {!session && !authLoading && <p className="relative mt-3 text-center text-[10px] text-zinc-500">SIGN IN REQUIRED TO PURCHASE</p>}
              {error && <p role="alert" className="relative mt-4 border border-red-900 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
            </article>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-[10px] tracking-[0.14em] text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <span>MANIFEST — AI IMAGE GENERATION</span>
          <span>© 2026 Monism. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="text-zinc-200 transition hover:text-white">PRICING</Link>
            <Link href="/terms" className="text-zinc-200 transition hover:text-white">TERMS</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
