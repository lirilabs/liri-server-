import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const owner = "lirilabs";
    const repoName = "liri-app-"; // your repo

    const headers = {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "User-Agent": "liri-version-reader"
    };

    // Fetch root directory
    const contentsResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      { headers }
    );

    const contents = await contentsResp.json();

    if (!Array.isArray(contents)) {
      return res.status(200).json({
        message: "Unexpected GitHub response",
        raw: contents
      });
    }

    // Find v1, v2, v10, v99...
    const versionFolders = contents
      .filter(item => item.type === "dir" && /^v\d+$/i.test(item.name))
      .map(item => ({
        name: item.name,
        number: parseInt(item.name.replace("v", ""), 10),
        path: item.path,
        type: item.type,
        url: item.url
      }));

    // Sort by number highest → lowest
    versionFolders.sort((a, b) => b.number - a.number);

    const latestVersion = versionFolders.length > 0 ? versionFolders[0] : null;

    return res.status(200).json({
      version_count: versionFolders.length,
      versions: versionFolders,     // all versions
      latest: latestVersion         // highest version like v10, v22...
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
