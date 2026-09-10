import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { contentTypeFor, getObject, keyFor } from "@/modules/applications/store";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FOLDER = /^[a-z0-9][a-z0-9_-]*$/i;
const FILE = /^[a-z0-9][a-z0-9._-]*$/i;

/** Stream one application-folder file straight from R2 (auth-gated). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string; folder: string; file: string }> },
) {
  await requireUserId();
  const { date, folder, file } = await params;
  if (!DATE.test(date) || !FOLDER.test(folder) || !FILE.test(file)) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  const body = await getObject(keyFor(date, folder, file));
  if (!body) return NextResponse.json({ error: "not found" }, { status: 404 });

  const inline = /\.(pdf|html?|png|jpe?g|webp|txt|md|json)$/i.test(file);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypeFor(file),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
