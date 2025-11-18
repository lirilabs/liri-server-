import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your actual PAT
const GITHUB_PAT = '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';

app.get('/repos', async (req, res) => {
  try {
    const response = await fetch('https://api.github.com/repos/lirilabs/liri-database-v1-2025', {
      headers: {
        'Authorization': `Bearer ${GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'node-server'
      }
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: await response.text() });
    }
    const repo = await response.json();
    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
