import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !keyId || !keySecret) {
    return jsonError("Payment service is not configured.", 503);
  }

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonError("Sign in before purchasing credits.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid payment request.", 400);
  }

  const requestedUserId =
    typeof body === "object" && body !== null && "userId" in body
      ? (body as { userId?: unknown }).userId
      : undefined;

  try {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user || requestedUserId !== authData.user.id) {
      return jsonError("Your session is invalid. Please sign in again.", 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) return jsonError("Credit profile is unavailable.", 404);
    if (profile.credits >= 5) return jsonError("You still have credits available.", 409);

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const { data: pendingPayment, error: pendingError } = await admin
      .from("credit_payments")
      .select("payment_link_id, short_url")
      .eq("user_id", authData.user.id)
      .eq("status", "created")
      .maybeSingle();

    if (pendingError) return jsonError("Could not load the pending payment.", 503);
    if (pendingPayment?.short_url) {
      const existingLink = await razorpay.paymentLink.fetch(pendingPayment.payment_link_id);
      if (
        existingLink.status === "created" &&
        Number(existingLink.amount) === 10000 &&
        existingLink.currency === "INR"
      ) {
        return NextResponse.json({ short_url: pendingPayment.short_url });
      }
      if (existingLink.status === "paid") {
        return jsonError("Your payment is being confirmed. Refresh your credits in a moment.", 409);
      }

      const { error: removeError } = await admin
        .from("credit_payments")
        .delete()
        .eq("user_id", authData.user.id)
        .eq("payment_link_id", pendingPayment.payment_link_id)
        .eq("status", "created");
      if (removeError) return jsonError("Could not refresh the expired payment link.", 503);
    }

    const referenceId = randomUUID().replace(/-/g, "").substring(0, 30);
    const metadata = authData.user.user_metadata ?? {};
    const customerName =
      (typeof metadata.full_name === "string" && metadata.full_name) ||
      (typeof metadata.name === "string" && metadata.name) ||
      "Manifest User";
    const paymentLink = await razorpay.paymentLink.create({
      amount: 10000,
      currency: "INR",
      description: "25 Manifest Credits",
      reference_id: referenceId,
      callback_url: (siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl) + "/api/payment/callback",
      callback_method: "get",
      expire_by: Math.floor(Date.now() / 1000) + 1200,
      customer: { name: customerName, email: authData.user.email || "" },
      notify: { email: Boolean(authData.user.email), sms: false, whatsapp: false },
    });

    const paymentRecord = {
      user_id: authData.user.id,
      reference_id: referenceId,
      payment_link_id: paymentLink.id,
      short_url: paymentLink.short_url,
      amount: 10000,
      currency: "INR",
      status: "created",
    };

    const writeResult = await admin.from("credit_payments").insert(paymentRecord).select("reference_id, payment_link_id").single();

    if (
      writeResult.error ||
      !writeResult.data ||
      writeResult.data.reference_id !== referenceId ||
      writeResult.data.payment_link_id !== paymentLink.id
    ) {
      console.error("CREDIT PAYMENT ROW COULD NOT BE CONFIRMED", writeResult.error);
      return jsonError("Could not save the payment link.", 503);
    }

    console.log("PAYMENT LINK MAPPING SAVED", {
      reference_id: referenceId,
      payment_link_id: paymentLink.id,
      user_id: authData.user.id,
    });
    return NextResponse.json({ short_url: paymentLink.short_url });
  } catch (error: any) {
    console.error("RAZORPAY PAYMENT LINK ERROR:", error);
    const msg = error?.error?.description || error?.message || "Could not create a payment link.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
