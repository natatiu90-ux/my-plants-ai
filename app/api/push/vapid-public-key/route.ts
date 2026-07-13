import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push-server";

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
