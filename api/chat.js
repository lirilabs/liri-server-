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

  // Incoming from client
  // { from, to, category, videoUrl, timestamp }
  const body = req.body;

  const senderId = body.from;
  const receiverId = body.to;

  // Unique message ID
  const messageId = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 999999);

  // Final message object (clean)
  const newMessage = {
    id: messageId,
    senderId,
    receiverId,
    category: body.category,
    videoUrl: body.videoUrl,
    timestamp: body.timestamp || Math.floor(Date.now() / 1000)
  };

  // Create unique folder for pair
  const folder = [senderId, receiverId].sort().join("_");

  // Daily file
  const today = new Date().toISOString().split("T")[0];
  const filePath = `messages/${folder}/${today}.json`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  async function getFile() {
    const r = await fetch(apiUrl, { headers });
    return r.status === 200 ? await r.json() : null;
  }

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
      items: [newMessage]
    });
  } else {
    // Append
    const json = JSON.parse(Buffer.from(existing.content, "base64").toString());
    json.items.push(newMessage);
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
