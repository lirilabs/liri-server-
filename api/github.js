import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const owner = "lirilabs";
    const repoName = "liri-app-";  // UPDATED to read this repo

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "liri-repo-version-reader"
    };

    // 1. Fetch repo info
    const repoResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      { headers }
    );
    const repoInfo = await repoResp.json();

    if (!repoResp.ok) {
      return res.status(repoResp.status).json({
        error: "Failed to fetch repository",
        details: repoInfo
      });
    }

    // 2. Fetch root directory contents
    const contentsResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      { headers }
    );
    const contents = await contentsResp.json();

    if (!Array.isArray(contents)) {
      return res.status(200).json({
        message: "Root folder is empty or GitHub returned unexpected structure",
        raw: contents
      });
    }

    // 3. Filter versioned folders: v1, v2, v3...
    const versionFolders = contents
      .filter(item => item.type === "dir" && /^v\d+$/i.test(item.name))
      .map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        url: item.url,
        download_url: item.download_url
      }));

    return res.status(200).json({
      repository: repoInfo.full_name,
      description: repoInfo.description,
      default_branch: repoInfo.default_branch,
      version_count: versionFolders.length,
      versions: versionFolders
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
