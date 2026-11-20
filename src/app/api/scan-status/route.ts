import { NextResponse } from "next/server";
import { scanStatus } from "@/lib/analysis/background";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(scanStatus());
}
