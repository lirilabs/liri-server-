import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false
  }
};

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;

/* ======================================================
   IMAGE TYPE DETECTION (MAGIC BYTES)
====================================================== */
function detectImage(buffer) {
  if (buffer.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])))
    return "png";

  if (buffer.slice(0, 3).equals(Buffer.from([0xFF,0xD8,0xFF])))
    return "jpg";

  if (buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP")
    return "webp";

  if (buffer.slice(0, 3).toString() === "GIF")
    return "gif";

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  if (!TOKEN) {
    return res.status(500).json({ error: "GitHub token missing" });
  }

  try {
    // Read raw binary
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const ext = detectImage(buffer);
    if (!ext) {
      return res.status(400).json({ error: "Unsupported image format" });
    }

    const timestamp = Date.now();
    const path = `fall/${timestamp}/filesent.${ext}`;

    const encoded = buffer.toString("base64");

    const resp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json"
        },
        body: JSON.stringify({
          message: `Upload ${ext.toUpperCase()} image`,
          content: encoded,
          branch: BRANCH
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.json();
      return res.status(resp.status).json(err);
    }

    const result = await resp.json();

    return res.status(201).json({
      success: true,
      format: ext,
      path,
      url: result.content.html_url
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
