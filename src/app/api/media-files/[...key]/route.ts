import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { contentTypeFor, getFile } from "@/modules/files/store";

/** Auth-gated stream of one object from the `my-files` R2 bucket. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  await requireUserId();
  const { key: parts } = await params;
  const key = parts.join("/");
  if (!key || key.includes("..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  const body = await getFile(key);
  if (!body) return NextResponse.json({ error: "not found" }, { status: 404 });

  const filename = parts[parts.length - 1];
  const inline = /\.(pdf|html?|png|jpe?g|webp|svg|txt|md|json)$/i.test(filename);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypeFor(key),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
