import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const BLOCKED_TERMS = /\\b(nsfw|nude|explicit|gore)\\b/i;
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const SAFETY_ERROR = "The generation server flagged this prompt as a false positive. Please try again or add more descriptive words (e.g., 'A photo of...').";
const TEMPORARY_ERROR = "Our generation servers are currently experiencing high traffic. Please try again in a few minutes.";
const CREDIT_COST = 5;

interface CloudflareResponse {
  success?: boolean;
  result?: { image?: unknown };
}

type AdminClient = SupabaseClient<any>;

type CreditAccess =
  | { response: NextResponse }
  | { admin: AdminClient; userId: string; credits: number };

async function getAuthenticatedCredits(request: Request): Promise<CreditAccess> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];

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

    return { admin, userId: authData.user.id, credits: profile.credits };
  } catch {
    return { response: NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 }) };
  }
}

async function refundCredits(admin: AdminClient, userId: string) {
  const { error } = await admin.rpc("refund_profile_credits", {
    p_user_id: userId,
    p_amount: CREDIT_COST,
  });
  if (error) {
    // Keep this error visible so a failed refund can be reconciled from server logs.
    console.error("IMAGE GENERATION CREDIT REFUND FAILED", { userId, error });
    return false;
  }
  return true;
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

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
  }

  const creditAccess = await getAuthenticatedCredits(request);
  if ("response" in creditAccess) return creditAccess.response;
  if (creditAccess.credits < CREDIT_COST) {
    return NextResponse.json({ error: "You need at least 5 credits to generate an image." }, { status: 402 });
  }

  // Debit atomically before calling the paid generation provider. A profile read alone
  // is not sufficient: concurrent requests could otherwise spend the same credits.
  const { data: remainingCredits, error: debitError } = await creditAccess.admin.rpc("deduct_profile_credits", {
    p_user_id: creditAccess.userId,
    p_amount: CREDIT_COST,
  });
  if (debitError) {
    console.error("IMAGE GENERATION CREDIT RESERVATION FAILED", debitError);
    return NextResponse.json({ error: "Could not reserve credits. Please try again." }, { status: 503 });
  }
  if (typeof remainingCredits !== "number") {
    return NextResponse.json({ error: "You need at least 5 credits to generate an image." }, { status: 402 });
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
      const refunded = await refundCredits(creditAccess.admin, creditAccess.userId);
      return NextResponse.json(
        { error: refunded ? SAFETY_ERROR : "Generation was blocked and your credit refund is being investigated." },
        { status: 400 },
      );
    }

    if (!response.ok) {
      const refunded = await refundCredits(creditAccess.admin, creditAccess.userId);
      return NextResponse.json(
        { error: refunded ? TEMPORARY_ERROR : "Generation failed and your credit refund is being investigated." },
        { status: 503 },
      );
    }

    let data: CloudflareResponse;
    try {
      data = JSON.parse(responseText) as CloudflareResponse;
    } catch {
      await refundCredits(creditAccess.admin, creditAccess.userId);
      return NextResponse.json({ error: TEMPORARY_ERROR }, { status: 503 });
    }

    if (!data.success || typeof data.result?.image !== "string" || !data.result.image) {
      const refunded = await refundCredits(creditAccess.admin, creditAccess.userId);
      return NextResponse.json(
        { error: refunded ? TEMPORARY_ERROR : "Generation failed and your credit refund is being investigated." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      images: [`data:image/jpeg;base64,${data.result.image}`],
      credits: remainingCredits,
    });
  } catch {
    const refunded = await refundCredits(creditAccess.admin, creditAccess.userId);
    return NextResponse.json(
      { error: refunded ? TEMPORARY_ERROR : "Generation failed and your credit refund is being investigated." },
      { status: 503 },
    );
  }
}
