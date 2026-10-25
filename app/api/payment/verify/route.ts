import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export const runtime = "nodejs";
const ORDER_AMOUNT = 40000;
const ORDER_CURRENCY = "INR";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !keyId || !keySecret) {
    return jsonError("Payment service is not configured.", 503);
  }

  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonError("Sign in before verifying payment.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid payment verification request.", 400);
  }

  const values = typeof body === "object" && body !== null
    ? body as Record<string, unknown>
    : {};
  const orderId = values.razorpay_order_id;
  const paymentId = values.razorpay_payment_id;
  const signature = values.razorpay_signature;

  if (
    typeof orderId !== "string" || !orderId ||
    typeof paymentId !== "string" || !paymentId ||
    typeof signature !== "string" || !signature
  ) {
    return jsonError("Missing payment verification fields.", 400);
  }

  try {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !authData.user) return jsonError("Your session is invalid. Please sign in again.", 401);

    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const receivedSignature = Buffer.from(signature, "hex");
    if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
      return jsonError("Payment signature verification failed.", 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: paymentRecord, error: recordError } = await admin
      .from("credit_payments")
      .select("user_id, reference_id, payment_link_id, payment_id, amount, currency, status")
      .eq("payment_link_id", orderId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (
      recordError ||
      !paymentRecord ||
      paymentRecord.reference_id !== orderId ||
      paymentRecord.payment_link_id !== orderId ||
      paymentRecord.amount !== ORDER_AMOUNT ||
      paymentRecord.currency !== ORDER_CURRENCY ||
      (paymentRecord.status === "paid" && paymentRecord.payment_id !== paymentId) ||
      (paymentRecord.status !== "created" && paymentRecord.status !== "paid")
    ) {
      return jsonError("Checkout order was not found for this account.", 400);
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(orderId),
      razorpay.payments.fetch(paymentId),
    ]);

    if (
      order.id !== orderId ||
      Number(order.amount) !== ORDER_AMOUNT ||
      order.currency !== ORDER_CURRENCY ||
      Number(order.amount_paid) !== ORDER_AMOUNT ||
      order.receipt !== authData.user.id ||
      payment.order_id !== orderId ||
      payment.id !== paymentId ||
      payment.status !== "captured" ||
      Number(payment.amount) !== ORDER_AMOUNT ||
      payment.currency !== ORDER_CURRENCY
    ) {
      return jsonError("Payment has not been captured for this order.", 400);
    }

    const { data: credits, error: creditError } = await admin.rpc("apply_razorpay_credit_payment", {
      p_payment_link_id: orderId,
      p_payment_id: paymentId,
      p_user_id: authData.user.id,
    });
    if (creditError?.code === "23505") {
      return jsonError("This payment has already been processed.", 400);
    }
    if (creditError || typeof credits !== "number") {
      return jsonError("Payment was verified but credits could not be updated.", 503);
    }

    return NextResponse.json({ success: true, credits });
  } catch (error) {
    console.error("RAZORPAY VERIFICATION ERROR:", error);
    return jsonError("Could not verify payment. Please try again.", 500);
  }
}
