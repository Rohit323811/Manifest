import Image from "next/image";
import Link from "next/link";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing Monism, you agree to these terms.",
  },
  {
    title: "2. AI Generation & Content Policy",
    body: "You agree not to generate illegal, harmful, or NSFW content. We reserve the right to block prompts that violate our safety filters (handled by our AI providers).",
  },
  {
    title: "3. Credits & Payments",
    body: "Credits are non-refundable. Payments are processed securely via Razorpay. 25 Credits cost ₹100 and allow for 5 image generations.",
  },
  {
    title: "4. Limitation of Liability",
    body: 'Monism is provided "as is". We are not responsible for how you use the generated images.',
  },
  {
    title: "5. Contact",
    body: "For support, contact us at rohitji8007@gmail.com.",
  },
];

export default function TermsPage() {
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
          <Link href="/console" className="shrink-0 whitespace-nowrap border border-zinc-800 px-4 py-3 text-[10px] font-bold tracking-[0.14em] text-zinc-300 transition hover:border-zinc-400 hover:text-white">RETURN TO CONSOLE</Link>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/console" className="mb-8 inline-block text-sm text-zinc-400 hover:text-white">← RETURN TO CONSOLE</Link>
        <p className="mb-3 text-[10px] font-bold tracking-[0.2em] text-zinc-400">MANIFEST / LEGAL</p>
        <h1 className="font-sans text-4xl font-bold tracking-tight text-white sm:text-5xl">TERMS OF SERVICE</h1>
        <p className="mt-4 text-sm text-zinc-500">Last updated: October 2026</p>

        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 mt-8 text-lg font-bold text-white">{section.title}</h2>
            <p className="mb-4 text-sm leading-relaxed text-zinc-400">{section.body}</p>
          </section>
        ))}
      </article>

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
