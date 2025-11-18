import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const owner = "lirilabs";
    const repoName = "liri-database-v1-2025";

    // 1. FETCH REPO INFO
    const repoInfoResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "liri-vercel-github-reader"
        }
      }
    );

    const repoInfo = await repoInfoResp.json();

    if (!repoInfoResp.ok) {
      return res.status(repoInfoResp.status).json({
        error: "Failed to fetch repository",
        details: repoInfo
      });
    }

    // 2. FETCH CONTENTS OF ROOT DIRECTORY
    const fileListResp = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/contents`,
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "liri-vercel-github-reader"
        }
      }
    );

    const fileList = await fileListResp.json();

    // SAFETY CHECK — GitHub returns object on error
    if (!Array.isArray(fileList)) {
      return res.status(200).json({
        repository: repoInfo.full_name,
        description: repoInfo.description,
        default_branch: repoInfo.default_branch,
        message: "Repo exists but root folder is empty or GitHub returned an error",
        fileListReturned: fileList // send raw GitHub message for debugging
      });
    }

    // 3. SUCCESS
    return res.status(200).json({
      repository: repoInfo.full_name,
      description: repoInfo.description,
      default_branch: repoInfo.default_branch,
      stars: repoInfo.stargazers_count,
      forks: repoInfo.forks,
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
