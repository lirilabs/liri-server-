import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const owner = "lirilabs";
    const repoName = "liri-app-";   // FIXED repo name

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "liri-recursive-reader"
    };

    // Recursive function to read any folder
    async function readFolder(path = "") {
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

      const resp = await fetch(url, { headers });
      const data = await resp.json();

      if (!Array.isArray(data)) {
        return { error: true, data };
      }

      // Loop through folder items
      const results = [];

      for (const item of data) {
        if (item.type === "dir") {
          // Read subfolder recursively
          const sub = await readFolder(item.path);
          results.push({
            name: item.name,
            path: item.path,
            type: "directory",
            children: sub
          });
        } else {
          // Add file
          results.push({
            name: item.name,
            path: item.path,
            type: "file",
            download_url: item.download_url
          });
        }
      }

      return results;
    }

    // Read entire repo root recursively
    const fullTree = await readFolder("");

    return res.status(200).json({
      repository: `${owner}/${repoName}`,
      tree: fullTree
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
