import fetch from "node-fetch";

export default async function handler(req, res) {

  // CORS — ALLOW ALL ORIGINS --------------------------------------
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  // ---------------------------------------------------------------

  try {
    const owner = "lirilabs";
    const repoName = "liri-app-";

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "liri-version-content-reader",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };

    // FORCE NO-CACHE for file content downloads
    const fileNoCacheHeaders = {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };

    // Helper: Fetch JSON file contents ----------------------------------------
    async function fetchJsonContent(downloadUrl) {
      try {
        const resp = await fetch(downloadUrl, {
          method: "GET",
          headers: fileNoCacheHeaders
        });

        const text = await resp.text();

        try {
          return JSON.parse(text);
        } catch {
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
          const children = await readFolder(item.path);
          results.push({
            name: item.name,
            path: item.path,
            type: "directory",
            children
          });

        } else {
          const fileObj = {
            name: item.name,
            path: item.path,
            type: "file",
            download_url: item.download_url
          };

          // If JSON file → read content live (no-cache)
          if (item.name.endsWith(".json")) {
            fileObj.jsonContent = await fetchJsonContent(item.download_url);
          }

          results.push(fileObj);
        }
      }

      return results;
    }
    // --------------------------------------------------------------------------

    // Read root folder (no-cache)
    const rootResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      { headers }
    );

    const root = await rootResp.json();

    if (!Array.isArray(root)) {
      return res.status(200).json({ message: "Unexpected GitHub structure", raw: root });
    }

    // Detect version folders (v1, v2, v10...)
    const versionFolders = root
      .filter(item => item.type === "dir" && /^v\d+$/i.test(item.name))
      .map(item => ({
        name: item.name,
        number: parseInt(item.name.replace("v", "")),
        path: item.path
      }))
      .sort((a, b) => b.number - a.number);

    const content = {};

    // Read content of each version folder (no-cache)
    for (const v of versionFolders) {
      content[v.name] = await readFolder(v.path);
    }

    // Latest version
    const latest = versionFolders.length > 0 ? versionFolders[0] : null;

    if (latest) {
      latest.files = content[latest.name];
    }

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
