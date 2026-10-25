"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const paymentSucceeded = paymentStatus === "true";
  const paymentFailed = paymentStatus === "false";

  const heading = paymentSucceeded
    ? "PAYMENT CONFIRMED"
    : paymentFailed
      ? "PAYMENT FAILED"
      : "ACCESS GRANTED";
  const message = paymentSucceeded
    ? "Payment successful! 25 credits have been added to your account."
    : paymentFailed
      ? "Payment failed or was cancelled."
      : "Account created. Welcome to Manifest.";
  const messageColor = paymentFailed ? "text-red-400" : "text-zinc-300";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 font-sans text-zinc-100">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8 text-center shadow-2xl shadow-black/40 sm:p-12">
        <p className="mb-5 text-xs tracking-[0.16em] text-zinc-500">MANIFEST / SYSTEM STATUS</p>
        <h1 className={`text-3xl font-semibold tracking-tight sm:text-5xl ${paymentFailed ? "text-red-400" : "text-zinc-300"}`}>
          {heading}
        </h1>
        <p role={paymentStatus ? "status" : undefined} className={`mx-auto mt-6 max-w-md text-sm leading-7 sm:text-base ${messageColor}`}>
          {message}
        </p>
        <Link
          href="/"
          className="mt-9 inline-flex items-center justify-center rounded-full bg-white px-8 py-3 font-medium text-black transition hover:bg-zinc-200"
        >
          Return to Console
        </Link>
      </section>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#050505] font-sans text-zinc-400">LOADING STATUS...</main>}>
      <SuccessContent />
    </Suspense>
  );
}
