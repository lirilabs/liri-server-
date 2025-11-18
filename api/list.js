import fetch from "node-fetch";

export default async function handler(req, res) {
  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`
        }
      }
    );

    const data = await resp.json();
    return res.status(200).json({ files: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
