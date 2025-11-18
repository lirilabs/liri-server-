import fetch from "node-fetch";

// Rate limiting helper
const rateLimiter = new Map();

function checkRateLimit(ip, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const userRequests = rateLimiter.get(ip) || [];
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= limit) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimiter.set(ip, recentRequests);
  return true;
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['GET']
    });
  }

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.' 
    });
  }

  // Validate environment variables
  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not configured');
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }

  const owner = process.env.GITHUB_OWNER || "lirilabs";
  const repo = process.env.GITHUB_REPO || "liri-database-v1-2025";

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Liri-DB-Manager'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('GitHub API error:', resp.status, errorText);
      
      if (resp.status === 404) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      if (resp.status === 403) {
        return res.status(403).json({ error: 'Access forbidden. Check token permissions.' });
      }
      
      return res.status(resp.status).json({ 
        error: 'Failed to fetch files from GitHub' 
      });
    }

    const data = await resp.json();
    
    // Filter and sanitize response
    const sanitizedFiles = data.map(file => ({
      name: file.name,
      path: file.path,
      size: file.size,
      type: file.type,
      sha: file.sha,
      url: file.html_url
    }));

    return res.status(200).json({ 
      success: true,
      count: sanitizedFiles.length,
      files: sanitizedFiles 
    });

  } catch (e) {
    console.error('Error in list handler:', e);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
}
