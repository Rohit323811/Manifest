import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const BLOCKED_TERMS = /\b(nsfw|nude|explicit|gore)\b/i;
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const SAFETY_ERROR = "The generation server flagged this prompt as a false positive. Please try again or add more descriptive words (e.g., 'A photo of...').";
const TEMPORARY_ERROR = "Our generation servers are currently experiencing high traffic. Please try again in a few minutes.";

interface CloudflareResponse {
  success?: boolean;
  result?: { image?: unknown };
}

type CreditAccess = { credits: number } | { response: NextResponse };

async function getAuthenticatedCredits(request: Request): Promise<CreditAccess> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!url || !anonKey || !serviceRoleKey) {
    return { response: NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 }) };
  }
  if (!accessToken) {
    return { response: NextResponse.json({ error: "Sign in to generate images." }, { status: 401 }) };
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return { response: NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 }) };
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || typeof profile.credits !== "number") {
      return { response: NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 }) };
    }

    return { credits: profile.credits };
  } catch {
    return { response: NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 }) };
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt?: unknown }).prompt
      : undefined;

  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "Enter a prompt to generate an image." }, { status: 400 });
  }

  if (BLOCKED_TERMS.test(prompt)) {
    return NextResponse.json({ error: SAFETY_ERROR }, { status: 400 });
  }

  const creditAccess = await getAuthenticatedCredits(request);
  if ("response" in creditAccess) return creditAccess.response;
  if (creditAccess.credits < 5) {
    return NextResponse.json({ error: "You need at least 5 credits to generate an image." }, { status: 402 });
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
  }

  try {
    const response = await fetch(
      `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: prompt.trim(), steps: 4 }),
        cache: "no-store",
      },
    );

    const responseText = await response.text();
    const isSafetyViolation =
      response.status === 400 ||
      response.status === 403 ||
      /nsfw|safety|blocked|flagged/i.test(responseText);

    if (isSafetyViolation) {
      return NextResponse.json({ error: SAFETY_ERROR }, { status: 400 });
    }

    if (response.status === 429 || response.status === 500 || !response.ok) {
      return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
    }

    const data = JSON.parse(responseText) as CloudflareResponse;
    if (!data.success) {
      return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
    }

    if (typeof data.result?.image !== "string" || !data.result.image) {
      return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
    }

    return NextResponse.json({ images: [`data:image/jpeg;base64,${data.result.image}`] });
  } catch {
    return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
  }
}
