import fetch from "node-fetch";

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const owner = "lirilabs";
  const repo = "liri-database-v1-2025";
  const token = process.env.GITHUB_TOKEN;

  const headers = {
    Authorization: `token ${token}`,
    "Content-Type": "application/json"
  };

  // Incoming body:
  // { from, to, category, videoUrl, timestamp }
  const newItem = req.body;

  const uid1 = newItem.from;
  const uid2 = newItem.to;

  // Always sort UIDs
  const folderName = [uid1, uid2].sort().join("_");

  // Today's filename
  const today = new Date().toISOString().split("T")[0]; 
  const filePath = `messages/${folderName}/${today}.json`;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  async function getFile() {
    const r = await fetch(apiUrl, { headers });
    return r.status === 200 ? await r.json() : null;
  }

  async function uploadFile(content, sha = null) {
    await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `update ${filePath}`,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
        sha
      })
    });
  }

  // Check if today's file exists
  const existing = await getFile();

  if (!existing) {
    await uploadFile({
      date: today,
      items: [newItem]
    });
  } else {
    const json = JSON.parse(Buffer.from(existing.content, "base64").toString());
    json.items.push(newItem);
    await uploadFile(json, existing.sha);
  }

  // Read updated file
  const finalData = await getFile();
  const decoded = JSON.parse(Buffer.from(finalData.content, "base64").toString());

  return res.json({
    status: "ok",
    folder: folderName,
    file: today + ".json",
    messages: decoded.items
  });
}
