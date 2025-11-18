import fetch from "node-fetch";

// Rate limiting helper
const rateLimiter = new Map();

function checkRateLimit(ip, limit = 20, windowMs = 60000) {
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

// Validate filename
function isValidFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  const validPattern = /^[a-zA-Z0-9_\-\.]+$/;
  if (!validPattern.test(filename) || filename.length > 255) {
    return false;
  }
  return true;
}

// Protected files that should never be deleted
const PROTECTED_FILES = [
  'README.md',
  'LICENSE',
  '.gitignore',
  'package.json'
];

function isProtectedFile(filename) {
  return PROTECTED_FILES.includes(filename);
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  
  // Only allow POST requests (DELETE for destructive operations via POST)
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  // Rate limiting (very strict for delete operations)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(clientIp, 20)) { // 20 requests per minute
    return res.status(429).json({ 
      error: 'Too many delete requests. Please try again later.' 
    });
  }

  // Validate environment variables
  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not configured');
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }

  // Authentication check (REQUIRED for delete operations)
  const authHeader = req.headers.authorization;
  if (process.env.REQUIRE_AUTH === 'true' && !authHeader) {
    return res.status(401).json({ 
      error: 'Authentication required for delete operations' 
    });
  }

  const { file, confirm, csrfToken } = req.body;

  // Require explicit confirmation
  if (confirm !== true && confirm !== 'true') {
    return res.status(400).json({ 
      error: 'Delete operation requires explicit confirmation. Set confirm: true' 
    });
  }

  // Validate filename
  if (!file) {
    return res.status(400).json({ 
      error: 'Missing required field: file' 
    });
  }

  if (!isValidFilename(file)) {
    return res.status(400).json({ 
      error: 'Invalid filename. Use only alphanumeric characters, dash, underscore, and dot.' 
    });
  }

  // Check if file is protected
  if (isProtectedFile(file)) {
    return res.status(403).json({ 
      error: `Cannot delete protected file: ${file}` 
    });
  }

  // CSRF protection (implement properly in production)
  // if (!verifyCsrfToken(csrfToken, req.session?.csrfToken)) {
  //   return res.status(403).json({ error: 'Invalid CSRF token' });
  // }

  const owner = process.env.GITHUB_OWNER || "lirilabs";
  const repo = process.env.GITHUB_REPO || "liri-database-v1-2025";
  const branch = process.env.GITHUB_BRANCH || "main";

  try {
    // First, get file info to retrieve SHA
    const infoResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Liri-DB-Manager'
        },
        timeout: 10000
      }
    );

    if (!infoResp.ok) {
      if (infoResp.status === 404) {
        return res.status(404).json({ 
          error: 'File not found' 
        });
      }
      
      console.error('Error fetching file info:', infoResp.status);
      return res.status(infoResp.status).json({ 
        error: 'Failed to retrieve file information' 
      });
    }

    const info = await infoResp.json();

    // Perform deletion
    const timestamp = new Date().toISOString();
    const commitMessage = `Delete ${file} via API - ${timestamp}`;

    const deleteResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Liri-DB-Manager'
        },
        body: JSON.stringify({
          message: commitMessage,
          sha: info.sha,
          branch
        }),
        timeout: 20000 // 20 second timeout
      }
    );

    if (!deleteResp.ok) {
      const errorData = await deleteResp.json();
      console.error('GitHub delete error:', deleteResp.status, errorData);
      
      if (deleteResp.status === 409) {
        return res.status(409).json({ 
          error: 'Conflict: File was modified. Please refresh and try again.' 
        });
      }
      
      return res.status(deleteResp.status).json({ 
        error: 'Failed to delete file from GitHub',
        details: process.env.NODE_ENV === 'development' ? errorData : undefined
      });
    }

    const result = await deleteResp.json();
    
    return res.status(200).json({ 
      success: true,
      message: `File ${file} deleted successfully`,
      commit: {
        sha: result.commit?.sha,
        url: result.commit?.html_url
      }
    });

  } catch (e) {
    console.error('Error in delete handler:', e);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
}
