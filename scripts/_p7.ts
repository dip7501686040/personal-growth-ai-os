async function main() {
  const { db } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");
  const skillsSvc = await import("@/modules/skills/service");
  const biz = await import("@/modules/business/service");
  const { businessAgent } = await import("@/modules/agents/business-agent");
  const uid = process.env.OWNER_USER_ID!;

  const bumpSlugs = ["nodejs","postgresql","nextjs","react","openai-api"];
  const bump = await db.select().from(s.skills).where(and(eq(s.skills.userId,uid), inArray(s.skills.slug, bumpSlugs)));
  for (const sk of bump) await skillsSvc.addEvidence(uid, sk.id, { summary:"p7 bump", supportsLevel:"implemented", strength:"strong", status:"accepted" });
  console.log("buildableWith:", (await biz.getBusinessSnapshot(uid)).buildableWith.join(", "));

  const run = await businessAgent.run({ userId: uid, trigger:"manual", triggerKey:"p7-"+Date.now(), force:true, input:{ market:"Kolkata, small local businesses", businessType:"clinics and salons", knownProblems:"missed WhatsApp appointment requests" } });
  const r = run.result as any;
  console.log("AGENT:", run.status, "| src:", r?.source, "| model:", r?.model, "| created:", r?.created?.length, "| err:", run.error);

  const opps = await biz.listOpportunities(uid);
  for (const o of opps) {
    console.log(`- [${o.complexity} · match ${o.skillMatchScore}%] ${o.title}`);
    console.log(`  stack: ${JSON.stringify(o.techStack)} | $: ${o.monetizationModel}`);
    console.log(`  scope: ${o.buildScope}`);
  }

  // dedup check: run again, should skip existing titles
  const run2 = await businessAgent.run({ userId: uid, trigger:"manual", triggerKey:"p7b-"+Date.now(), force:true, input:{ market:"Kolkata, small local businesses", businessType:"clinics and salons" } });
  console.log("RUN2 created (may be 0 if dupes):", (run2.result as any)?.created?.length, "| total opps now:", (await biz.listOpportunities(uid)).length);

  // cleanup
  for (const o of await biz.listOpportunities(uid)) await biz.deleteOpportunity(uid, o.id);
  await db.delete(s.skillEvidence).where(and(eq(s.skillEvidence.userId,uid), eq(s.skillEvidence.summary,"p7 bump")));
  for (const sk of bump) await skillsSvc.recomputeSkill(uid, sk.id);
  await db.delete(s.agentEvents).where(eq(s.agentEvents.userId,uid));
  await db.delete(s.agentRuns).where(and(eq(s.agentRuns.userId,uid), eq(s.agentRuns.agentName,"business")));
  await db.delete(s.aiUsage).where(eq(s.aiUsage.userId,uid));
  await db.delete(s.llmCache);
  await db.delete(s.agentModelConfig).where(eq(s.agentModelConfig.userId,uid));
  const lv = await db.select({n:s.skills.name,l:s.skills.level}).from(s.skills).where(inArray(s.skills.id, bump.map(x=>x.id)));
  console.log("restored:", JSON.stringify(lv), "| opps left:", (await biz.listOpportunities(uid)).length);
  await db.$client.end();
}
main().then(()=>process.exit(0)).catch(e=>{console.error("ERR", e?.stack||e?.message||e);process.exit(1)});
