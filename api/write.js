import fetch from "node-fetch";

export default async function handler(req, res) {
  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST required" });
  }

  const { file, content } = req.body;

  try {
    let sha = null;

    // Check if file exists
    const check = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file}`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`
        }
      }
    );

    if (check.ok) {
      const existing = await check.json();
      sha = existing.sha;
    }

    const encoded = Buffer.from(content).toString("base64");

    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file}`,
      {
        method: "PUT",
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "update via API",
          content: encoded,
          sha
        })
      }
    );

    const result = await resp.json();
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
