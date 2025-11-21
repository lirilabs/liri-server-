import fetch from "node-fetch";

export default async function handler(req, res) {

  // CORS ----------------------------------------------------------
const allowedOrigins = [
  "https://lirilabs.netlify.app",
  "http://localhost:3000",
  "http://localhost",
  "http://127.0.0.1:3000",
  "http://127.0.0.1"
  "http://localhost:5173/"
];
  const origin = req.headers.origin;

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // ---------------------------------------------------------------

  try {
    const owner = "lirilabs";
    const repoName = "liri-app-";

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "liri-version-content-reader"
    };

    // Helper to fetch JSON file contents ----------------------------------------
    async function fetchJsonContent(downloadUrl) {
      try {
        const resp = await fetch(downloadUrl);
        const text = await resp.text();

        try {
          return JSON.parse(text);
        } catch (err) {
          return { invalidJson: true, raw: text };
        }

      } catch (e) {
        return { error: "Failed to download JSON", details: e.message };
      }
    }

    // Recursive folder reader ----------------------------------------------------
    async function readFolder(path = "") {
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;
      const resp = await fetch(url, { headers });
      const data = await resp.json();

      if (!Array.isArray(data)) {
        return { error: true, raw: data };
      }

      const results = [];

      for (const item of data) {
        if (item.type === "dir") {
          // Read subfolder
          const children = await readFolder(item.path);
          results.push({
            name: item.name,
            path: item.path,
            type: "directory",
            children
          });

        } else {
          // File entry
          const fileObj = {
            name: item.name,
            path: item.path,
            type: "file",
            download_url: item.download_url
          };

          // Special: If JSON file, read and attach content
          if (item.name.endsWith(".json")) {
            fileObj.jsonContent = await fetchJsonContent(item.download_url);
          }

          results.push(fileObj);
        }
      }

      return results;
    }
    // --------------------------------------------------------------------------

    // Read repo root
    const rootResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      { headers }
    );
    const root = await rootResp.json();

    if (!Array.isArray(root)) {
      return res.status(200).json({ message: "Unexpected GitHub structure", raw: root });
    }

    // Detect version folders
    const versionFolders = root
      .filter(item => item.type === "dir" && /^v\d+$/i.test(item.name))
      .map(item => ({
        name: item.name,
        number: parseInt(item.name.replace("v", "")),
        path: item.path
      }))
      .sort((a, b) => b.number - a.number);

    const content = {};

    // Read content for each version folder
    for (const v of versionFolders) {
      content[v.name] = await readFolder(v.path);
    }

    // Latest folder
    const latest = versionFolders.length > 0 ? versionFolders[0] : null;

    if (latest) {
      latest.files = content[latest.name]; // Add file list
    }

    // Final JSON response
    return res.status(200).json({
      total: versionFolders.length,
      versions: versionFolders,
      latest,
      content
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
