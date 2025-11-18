import fetch from "node-fetch";
import crypto from "crypto";

// Rate limiting helper
const rateLimiter = new Map();

function checkRateLimit(ip, limit = 30, windowMs = 60000) {
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

// Validate content
function isValidContent(content) {
  if (typeof content !== 'string') return false;
  
  // Limit content size to 5MB
  if (content.length > 5 * 1024 * 1024) {
    return false;
  }
  
  return true;
}

// Verify CSRF token (implement in production)
function verifyCsrfToken(token, sessionToken) {
  // In production, implement proper CSRF protection
  // This is a placeholder
  return true;
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed: ['POST']
    });
  }

  // Rate limiting (stricter for write operations)
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (!checkRateLimit(clientIp, 30)) { // 30 requests per minute
    return res.status(429).json({ 
      error: 'Too many write requests. Please try again later.' 
    });
  }

  // Validate environment variables
  if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not configured');
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }

  // Authentication check (implement in production)
  const authHeader = req.headers.authorization;
  if (process.env.REQUIRE_AUTH === 'true' && !authHeader) {
    return res.status(401).json({ 
      error: 'Authentication required' 
    });
  }

  const { file, content, csrfToken } = req.body;

  // Validate inputs
  if (!file || !content) {
    return res.status(400).json({ 
      error: 'Missing required fields: file and content' 
    });
  }

  if (!isValidFilename(file)) {
    return res.status(400).json({ 
      error: 'Invalid filename. Use only alphanumeric characters, dash, underscore, and dot.' 
    });
  }

  if (!isValidContent(content)) {
    return res.status(400).json({ 
      error: 'Invalid content. Content must be a string under 5MB.' 
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
    let sha = null;
    let isUpdate = false;

    // Check if file exists
    const checkResp = await fetch(
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

    if (checkResp.ok) {
      const existing = await checkResp.json();
      sha = existing.sha;
      isUpdate = true;
    } else if (checkResp.status !== 404) {
      // Error other than "not found"
      console.error('Error checking file:', checkResp.status);
      return res.status(checkResp.status).json({ 
        error: 'Failed to check file status' 
      });
    }

    // Encode content
    const encoded = Buffer.from(content, 'utf8').toString('base64');

    // Generate commit message with timestamp
    const timestamp = new Date().toISOString();
    const action = isUpdate ? 'Update' : 'Create';
    const commitMessage = `${action} ${file} via API - ${timestamp}`;

    // Write/update file
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Liri-DB-Manager'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: encoded,
          branch,
          ...(sha && { sha }) // Only include sha if updating
        }),
        timeout: 20000 // 20 second timeout for write operations
      }
    );

    if (!resp.ok) {
      const errorData = await resp.json();
      console.error('GitHub write error:', resp.status, errorData);
      
      if (resp.status === 409) {
        return res.status(409).json({ 
          error: 'Conflict: File was modified by another process. Please retry.' 
        });
      }
      
      return res.status(resp.status).json({ 
        error: 'Failed to write file to GitHub',
        details: process.env.NODE_ENV === 'development' ? errorData : undefined
      });
    }

    const result = await resp.json();
    
    return res.status(isUpdate ? 200 : 201).json({ 
      success: true,
      action: isUpdate ? 'updated' : 'created',
      file,
      commit: {
        sha: result.commit?.sha,
        url: result.commit?.html_url
      }
    });

  } catch (e) {
    console.error('Error in write handler:', e);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
}
