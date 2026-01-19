import fetch from "node-fetch";

/* ======================================================
   VERCEL CONFIG – DISABLE BODY PARSER
====================================================== */
export const config = {
  api: {
    bodyParser: false
  }
};

/* ======================================================
   ENV CONFIG
====================================================== */
const OWNER = process.env.GITHUB_OWNER || "lirilabs";
const REPO = process.env.GITHUB_REPO || "liri-database-v1-2025";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;

/* ======================================================
   CORS – ALLOW ALL ORIGINS
====================================================== */
function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

/* ======================================================
   IMAGE TYPE DETECTION (MAGIC BYTES)
====================================================== */
function detectImage(buffer) {
  if (
    buffer.slice(0, 8).equals(
      Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])
    )
  ) return "png";

  if (
    buffer.slice(0, 3).equals(
      Buffer.from([0xFF,0xD8,0xFF])
    )
  ) return "jpg";

  if (
    buffer.slice(0, 4).toString() === "RIFF" &&
    buffer.slice(8, 12).toString() === "WEBP"
  ) return "webp";

  if (buffer.slice(0, 3).toString() === "GIF") return "gif";

  return null;
}

/* ======================================================
   HANDLER
====================================================== */
export default async function handler(req, res) {
  /* Enable CORS */
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  if (!TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN missing" });
  }

  try {
    /* Read raw binary */
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    if (!buffer.length) {
      return res.status(400).json({ error: "Empty request body" });
    }

    const ext = detectImage(buffer);
    if (!ext) {
      return res.status(400).json({ error: "Unsupported image format" });
    }

    const timestamp = Date.now();
    const filePath = `fall/${timestamp}/filesent.${ext}`;

    const encoded = buffer.toString("base64");

    const ghResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "Liri-Image-Upload"
        },
        body: JSON.stringify({
          message: `Upload image ${timestamp}`,
          content: encoded,
          branch: BRANCH
        })
      }
    );

    if (!ghResp.ok) {
      const err = await ghResp.json();
      return res.status(ghResp.status).json(err);
    }

    const result = await ghResp.json();

    const rawUrl =
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;

    return res.status(201).json({
      success: true,
      format: ext,
      path: filePath,
      imageUrl: rawUrl,
      githubUrl: result.content.html_url
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
