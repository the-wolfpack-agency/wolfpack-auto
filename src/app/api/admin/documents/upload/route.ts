/**
 * POST /api/admin/documents/upload — Upload a document file with metadata.
 *
 * Accepts multipart/form-data with:
 *   - file: the document (PDF, JPG, PNG, up to 25MB)
 *   - name, doc_type, deal_id, lead_id, vehicle_vin, notes (form fields)
 *
 * Storage strategy:
 *   1. R2 (if R2_ACCOUNT_ID set) — production
 *   2. Local /public/uploads/documents/ — dev fallback
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackDocument, trackSecurity } from "@/lib/analytics-hooks";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`doc-upload:${dealerId}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "documents/upload", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string)?.trim();
  const docType = formData.get("doc_type") as string;
  const dealId = (formData.get("deal_id") as string)?.trim() || null;
  const leadId = (formData.get("lead_id") as string)?.trim() || null;
  const vehicleVin = (formData.get("vehicle_vin") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  // Validate required fields
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 422 });
  }

  const validDocTypes = [
    "purchase_agreement", "title", "registration", "insurance", "disclosure",
    "credit_app", "trade_title", "lien_release", "inspection", "other",
    "buyers_guide", "odometer_disclosure", "arbitration_agreement", "privacy_notice",
  ];
  if (!docType || !validDocTypes.includes(docType)) {
    return NextResponse.json({ error: `doc_type must be one of: ${validDocTypes.join(", ")}` }, { status: 422 });
  }

  // File is optional (metadata-only upload allowed)
  let fileUrl: string | null = null;
  let fileSize: number | null = null;
  let mimeType: string | null = null;

  if (file && file.size > 0) {
    // Validate file type
    mimeType = file.type;
    if (!ALLOWED_TYPES[mimeType]) {
      return NextResponse.json(
        { error: `File type not allowed: ${mimeType}. Accepted: PDF, JPG, PNG, WebP` },
        { status: 422 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 25MB` },
        { status: 422 },
      );
    }

    fileSize = file.size;
    const ext = ALLOWED_TYPES[mimeType];
    const safeFilename = `${Date.now()}-${name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Try R2 first
    if (process.env.R2_ACCOUNT_ID) {
      try {
        const { uploadImage } = await import("@/lib/storage");
        const result = await uploadImage(dealerId, vehicleVin ?? "general", safeFilename, buffer);
        fileUrl = result.publicUrl;
      } catch (err) {
        console.error("[documents/upload] R2 upload failed, falling back to local:", err);
      }
    }

    // Fallback: store as data URL (works on Vercel's read-only filesystem)
    if (!fileUrl) {
      const base64 = buffer.toString("base64");
      fileUrl = `data:${mimeType};base64,${base64}`;
    }
  }

  const id = `doc-${Date.now().toString(36)}`;

  // Save document record
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO documents (id, dealer_id, deal_id, lead_id, vehicle_vin, doc_type, name, file_url, mime_type, file_size_bytes, uploaded_by, notes, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          id, dealerId, dealId, leadId, vehicleVin,
          docType, name, fileUrl, mimeType, fileSize,
          authResult.user.name, notes, [],
        ],
      );

      try { trackDocument("document.uploaded", dealerId, { doc_type: docType, document_id: id, has_file: String(!!fileUrl), file_size: fileSize ?? 0 }); } catch {}
      return NextResponse.json({ document: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[documents/upload] DB insert error:", err);
    }
  }

  // Shadow mode
  const created = {
    id,
    dealer_id: dealerId,
    deal_id: dealId,
    lead_id: leadId,
    vehicle_vin: vehicleVin,
    doc_type: docType,
    name,
    file_url: fileUrl,
    file_size_bytes: fileSize,
    mime_type: mimeType,
    uploaded_by: authResult.user.name,
    signed: false,
    signed_at: null,
    notes,
    tags: [],
    created_at: new Date().toISOString(),
  };

  try { trackDocument("document.uploaded", dealerId, { doc_type: docType, document_id: id, has_file: String(!!fileUrl), file_size: fileSize ?? 0 }); } catch {}
  return NextResponse.json({ document: created }, { status: 201 });
}
