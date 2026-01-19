import express from "express";
import fetch from "node-fetch";

const app = express();

/* ======================================================
   CONFIG
====================================================== */
const OWNER = process.env.GITHUB_OWNER || "lirilabs";
const REPO = process.env.GITHUB_REPO || "liri-database-v1-2025";
const BRANCH = "main";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  throw new Error("GITHUB_TOKEN is required");
}

/* ======================================================
   IMAGE TYPE DETECTION (MAGIC BYTES)
====================================================== */
function detectImage(buffer) {
  if (buffer.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])))
    return "png";

  if (buffer.slice(0, 3).equals(Buffer.from([0xFF,0xD8,0xFF])))
    return "jpg";

  if (buffer.slice(0, 4).toString() === "RIFF" &&
      buffer.slice(8, 12).toString() === "WEBP")
    return "webp";

  if (buffer.slice(0, 3).toString() === "GIF")
    return "gif";

  return null;
}

/* ======================================================
   RAW BODY READER (NO MULTER, NO PARSING)
====================================================== */
app.post("/upload-image", async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

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
          "User-Agent": "Liri-Image-Server"
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

    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;

    return res.status(201).json({
      success: true,
      format: ext,
      path: filePath,
      githubUrl: result.content.html_url,
      imageUrl: rawUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   SERVER START
====================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
