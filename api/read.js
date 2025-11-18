import fetch from "node-fetch";
import path from "path";

// Rate limiting helper
const rateLimiter = new Map();

function checkRateLimit(ip, limit = 100, windowMs = 60000) {
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

// Validate filename to prevent path traversal
function isValidFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  
  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }
  
  // Only allow alphanumeric, dash, underscore, and dot
  const validPattern = /^[a-zA-Z0-9_\-\.]+$/;
  if (!validPattern.test(filename)) {
    return false;
  }
  
  // Limit filename length
  if (filename.length > 255) {
    return false;
  }
  
  return true;
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  
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

  const { file } = req.query;

  // Validate filename
  if (!isValidFilename(file)) {
    return res.status(400).json({ 
      error: 'Invalid filename. Use only alphanumeric characters, dash, underscore, and dot.' 
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
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Liri-DB-Manager'
        },
        timeout: 15000 // 15 second timeout
      }
    );

    if (!resp.ok) {
      if (resp.status === 404) {
        return res.status(404).json({ error: 'File not found' });
      }
      if (resp.status === 403) {
        return res.status(403).json({ error: 'Access forbidden' });
      }
      
      return res.status(resp.status).json({ 
        error: 'Failed to read file from GitHub' 
      });
    }

    const json = await resp.json();

    if (json.content && json.encoding === 'base64') {
      try {
        const decoded = Buffer.from(json.content, 'base64').toString('utf8');
        
        // Check file size (limit to 1MB for safety)
        if (decoded.length > 1024 * 1024) {
          return res.status(413).json({ 
            error: 'File too large to display' 
          });
        }
        
        return res.status(200).json({ 
          success: true,
          file,
          content: decoded,
          size: json.size,
          sha: json.sha
        });
      } catch (decodeError) {
        console.error('Decoding error:', decodeError);
        return res.status(500).json({ 
          error: 'Failed to decode file content' 
        });
      }
    }

    return res.status(400).json({ 
      error: 'Invalid file format or content not available' 
    });

  } catch (e) {
    console.error('Error in read handler:', e);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
}
