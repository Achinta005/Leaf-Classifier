import { NextResponse } from "next/server";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const mlUrl = process.env.ML_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ detail: "Invalid multipart body." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ detail: "Missing file field." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ detail: "File too large (max 8MB)." }, { status: 400 });
  }

  const type = file.type || "";
  if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(type)) {
    return NextResponse.json(
      { detail: "Unsupported type. Use JPEG, PNG, or WebP." },
      { status: 400 },
    );
  }

  const out = new FormData();
  out.append("file", file, file.name || "leaf.jpg");

  let res: Response;
  try {
    res = await fetch(`${mlUrl}/predict`, {
      method: "POST",
      body: out,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        detail: `Could not reach ML service at ${mlUrl}. Start ml-service (uvicorn) or check ML_API_URL. ${msg}`,
      },
      { status: 502 },
    );
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { detail: "ML service returned non-JSON.", raw: text.slice(0, 500) },
      { status: 502 },
    );
  }

  if (res.ok && data && typeof data === "object") {
    const preds = (data as { predictions?: unknown }).predictions;
    if (
      !Array.isArray(preds) ||
      !preds.every(
        (p) =>
          p &&
          typeof p === "object" &&
          typeof (p as { label?: unknown }).label === "string" &&
          typeof (p as { confidence?: unknown }).confidence === "number",
      )
    ) {
      return NextResponse.json(
        { detail: "ML service returned an invalid predictions payload." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(data, { status: res.status });
}
