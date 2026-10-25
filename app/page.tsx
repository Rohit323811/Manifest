"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { CharacterReveal } from "./components/CharacterReveal";

export default function Home() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const handleGetStarted = async () => {
    setStarting(true);
    if (!supabase) {
      router.push("/login");
      return;
    }
    const { data } = await supabase.auth.getSession();
    router.push(data.session ? "/console" : "/login");
  };

  return (
    <main className="relative flex min-h-screen flex-col overflow-x-clip bg-[#050505] text-zinc-300">
      <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-[#050505]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Manifest home">
            <img src="/manifest.jpg?v=2" alt="Manifest logo" width={40} height={40} className="h-10 w-10 object-contain" />
            <span className="font-sans text-sm font-black tracking-[0.24em] text-white">MANIFEST</span>
          </Link>
          <Link href="/console" className="rounded-full bg-white px-5 py-3 text-[10px] font-bold tracking-[0.16em] text-black transition hover:bg-zinc-200">GET STARTED</Link>
        </div>
      </nav>

      <section id="top" className="view-enter mx-auto flex w-full flex-1 flex-col items-center justify-center px-5 py-12 text-center sm:px-8 sm:py-16">
        <div className="w-full max-w-[560px]"><CharacterReveal /></div>
        <div className="mt-2 max-w-3xl">
          <h1 className="font-sans text-4xl font-bold tracking-tight text-white md:text-5xl">
            <span className="block">Describe IT,</span>
            <span className="block">IT appears.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-zinc-400 sm:text-lg">Manifest is an AI image generation tool that turns your words into images.</p>
          <button type="button" onClick={handleGetStarted} disabled={starting} className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-8 py-3 font-medium text-black transition-all hover:bg-gray-200 disabled:cursor-wait disabled:opacity-60">
            {starting ? "CHECKING SESSION..." : "Get started"}
          </button>
        </div>
      </section>

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
