import { createHash } from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminPin = process.env.ADMIN_PIN;
  const adminSecret = process.env.ADMIN_API_SECRET;

  if (!adminPin || !adminSecret) {
    return res.status(500).json({ error: "Server not configured: missing ADMIN_PIN or ADMIN_API_SECRET" });
  }

  let hash;
  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body);
    hash = body.hash;
  } catch {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!hash) return res.status(400).json({ error: "Missing hash" });

  const expectedHash = createHash("sha256").update(adminPin).digest("hex");

  if (hash !== expectedHash) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.status(200).json({ secret: adminSecret });
}
