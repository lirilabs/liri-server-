import fetch from "node-fetch";

export default async function handler(req, res) {
  const { file } = req.query;
  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file}`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`
        }
      }
    );

    const json = await resp.json();

    if (json.content) {
      const decoded = Buffer.from(json.content, "base64").toString("utf8");
      return res.status(200).json({ file, content: decoded });
    }

    return res.status(400).json(json);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
