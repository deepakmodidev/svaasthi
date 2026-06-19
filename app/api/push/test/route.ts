import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { sendPushToUser } from "@/lib/push";

// Send a test push to the current user's subscribed browsers.
export async function POST() {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  await sendPushToUser(userId, {
    title: "Svaasthi",
    body: "Push notifications are working ✅",
  });
  return NextResponse.json({ ok: true });
}
