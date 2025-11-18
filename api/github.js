import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const owner = "lirilabs";
    const repoName = "liri-database-v1-2025";

    // Fetch repo metadata
    const repoInfo = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          "Authorization": `token ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "liri-vercel-github-reader"
        }
      }
    );

    if (!repoInfo.ok) {
      return res.status(repoInfo.status).json({
        error: "Unable to fetch repo information",
        details: await repoInfo.text()
      });
    }

    const repoData = await repoInfo.json();

    // Fetch file list from the repo root
    const fileListReq = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      {
        headers: {
          "Authorization": `token ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "liri-vercel-github-reader"
        }
      }
    );

    const fileList = await fileListReq.json();

    return res.status(200).json({
      repository: repoData.full_name,
      description: repoData.description,
      default_branch: repoData.default_branch,
      stars: repoData.stargazers_count,
      forks: repoData.forks,
      files: fileList.map(f => ({
        name: f.name,
        path: f.path,
        type: f.type,
        download_url: f.download_url
      }))
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
