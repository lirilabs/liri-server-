import fetch from "node-fetch";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";
  const token = process.env.GITHUB_TOKEN;

  const headers = {
    Authorization: `token ${token}`,
    "Content-Type": "application/json"
  };

  // Incoming item:
  // { from, to, category, videoUrl, timestamp }
  const newItem = req.body;

  const uid1 = newItem.from;
  const uid2 = newItem.to;

  // Unique folder for pair
  const folder = [uid1, uid2].sort().join("_");

  // Daily file name
  const today = new Date().toISOString().split("T")[0];
  const filePath = `messages/${folder}/${today}.json`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // Check file existence
  async function getFile() {
    const r = await fetch(apiUrl, { headers });
    return r.status === 200 ? await r.json() : null;
  }

  // Upload file to GitHub
  async function upload(content, sha = null) {
    return fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `update ${filePath}`,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
        sha
      })
    });
  }

  const existing = await getFile();

  if (!existing) {
    // New file for today
    await upload({
      date: today,
      items: [newItem]
    });
  } else {
    // Append to existing file
    const json = JSON.parse(Buffer.from(existing.content, "base64").toString());
    json.items.push(newItem);
    await upload(json, existing.sha);
  }

  const finalData = await getFile();
  const decoded = JSON.parse(Buffer.from(finalData.content, "base64").toString());

  return res.status(200).json({
    status: "ok",
    folder,
    file: today,
    messages: decoded.items
  });
}
