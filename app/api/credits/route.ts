import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type AuthContext =
  | { response: NextResponse }
  | { admin: SupabaseClient; userId: string };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function authorize(request: Request): Promise<AuthContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return { response: jsonError("Credit service is not configured.", 503) };
  }

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return { response: jsonError("Sign in to access your credits.", 401) };
  }

  try {
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return { response: jsonError("Your session is invalid. Please sign in again.", 401) };
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return { admin, userId: data.user.id };
  } catch {
    return { response: jsonError("Credit service is temporarily unavailable.", 503) };
  }
}

export async function GET(request: Request) {
  const context = await authorize(request);
  if ("response" in context) return context.response;

  try {
    const { data, error } = await context.admin
      .from("profiles")
      .select("credits")
      .eq("id", context.userId)
      .maybeSingle();

    if (error || !data || typeof data.credits !== "number") {
      return jsonError("Your credit profile is unavailable.", 404);
    }

    return NextResponse.json({ credits: data.credits });
  } catch {
    return jsonError("Credit service is temporarily unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const context = await authorize(request);
  if ("response" in context) return context.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid credit request.", 400);
  }

  if (typeof body !== "object" || body === null || !("action" in body) || body.action !== "deduct") {
    return jsonError("Invalid credit request.", 400);
  }

  try {
    const { data, error } = await context.admin.rpc("deduct_profile_credits", {
      p_user_id: context.userId,
      p_amount: 5,
    });

    if (error) {
      return jsonError("Could not update your credits. Please try again.", 503);
    }

    if (typeof data !== "number") {
      return jsonError("You need at least 5 credits to generate an image.", 402);
    }

    return NextResponse.json({ credits: data });
  } catch {
    return jsonError("Credit service is temporarily unavailable.", 503);
  }
}
