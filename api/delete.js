import fetch from "node-fetch";

export default async function handler(req, res) {
  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST required" });
  }

  const { file } = req.body;

  try {
    const infoResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file}`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`
        }
      }
    );

    if (!infoResp.ok) {
      return res.status(404).json({ error: "File not found" });
    }

    const info = await infoResp.json();

    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "delete file via API",
          sha: info.sha
        })
      }
    );

    const result = await resp.json();
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
