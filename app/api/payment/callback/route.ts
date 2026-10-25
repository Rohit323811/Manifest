import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export const runtime = "nodejs";

function redirect(request: Request, paid: boolean) {
  const destination = new URL("/success?payment=" + (paid ? "true" : "false"), request.url);
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const referenceId = url.searchParams.get("razorpay_payment_link_reference_id");
  const paymentLinkId = url.searchParams.get("razorpay_payment_link_id");
  const paymentId = url.searchParams.get("razorpay_payment_id");
  const callbackStatus = url.searchParams.get("razorpay_payment_link_status");

  if (!referenceId || !paymentLinkId || callbackStatus !== "paid") {
    console.error("PAYMENT CALLBACK NOT PAID OR MISSING REFERENCE", {
      referenceId,
      paymentLinkId,
      callbackStatus,
    });
    return redirect(request, false);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!supabaseUrl || !serviceKey || !keyId || !keySecret) {
    console.error("PAYMENT CALLBACK SERVICES ARE NOT CONFIGURED");
    return redirect(request, false);
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: paymentRecord, error: lookupError } = await admin
      .from("credit_payments")
      .select("user_id, reference_id, payment_link_id, status")
      .eq("payment_link_id", paymentLinkId)
      .maybeSingle();

    if (lookupError || !paymentRecord || paymentRecord.reference_id !== referenceId) {
      console.error("PAYMENT REFERENCE WAS NOT FOUND", lookupError);
      return redirect(request, false);
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);
    const linkedPaymentId = paymentLink.payments?.payment_id;
    const verifiedPaymentId = paymentId;

    if (
      paymentLink.status !== "paid" ||
      paymentLink.reference_id !== referenceId ||
      Number(paymentLink.amount) !== 10000 ||
      paymentLink.currency !== "INR" ||
      !verifiedPaymentId ||
      (linkedPaymentId && linkedPaymentId !== verifiedPaymentId)
    ) {
      console.error("RAZORPAY PAYMENT LINK DETAILS DID NOT MATCH", {
        referenceId,
        paymentLinkId,
        status: paymentLink.status,
        amount: paymentLink.amount,
        currency: paymentLink.currency,
      });
      return redirect(request, false);
    }

    if (paymentLink.payments?.status && paymentLink.payments.status !== "captured") {
      return redirect(request, false);
    }

    const { error: creditError } = await admin.rpc("apply_razorpay_credit_payment", {
      p_payment_link_id: paymentLinkId,
      p_payment_id: verifiedPaymentId,
      p_user_id: paymentRecord.user_id,
    });

    if (creditError) {
      console.error("PAYMENT CREDIT UPDATE FAILED", creditError);
      return redirect(request, false);
    }

    console.log("PAYMENT VERIFIED AND CREDITS ADDED", {
      paymentLinkId,
      referenceId,
      userId: paymentRecord.user_id,
    });
    return redirect(request, true);
  } catch (error) {
    console.error("PAYMENT CALLBACK FAILED", error);
    return redirect(request, false);
  }
}
