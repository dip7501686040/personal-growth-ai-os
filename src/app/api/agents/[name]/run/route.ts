import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAgent } from "@/modules/agents";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await requireUser();
  const { name } = await params;

  const agent = getAgent(name);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });
  }

  const run = await agent.run({
    userId: user.id,
    trigger: "manual",
    triggerKey: new Date().toISOString().slice(0, 10),
    force: true,
  });

  return NextResponse.json({
    id: run.id,
    status: run.status,
    error: run.error,
    summary: run.currentStep,
  });
}
