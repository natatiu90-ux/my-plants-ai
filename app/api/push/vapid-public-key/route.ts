import { NextResponse } from "next/server";
import { getPushConfigDiagnostics, getVapidPublicKey } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = getVapidPublicKey();
  const config = getPushConfigDiagnostics();
  if (!publicKey) {
    console.info("push_config_missing", { missing: config.missing });
    return NextResponse.json({ publicKey: "", missingConfig: config.missing }, { status: 503 });
  }

  return NextResponse.json({ publicKey, missingConfig: config.missing });
}
