const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');

// Verify JWT token on every protected route
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Pull user from DB to confirm still active
    const { data: user, error } = await supabase
      .from('users')
      .select('id, company_id, role, full_name, active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user || !user.active) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Attach user to request — all routes can access req.user
    req.user = user;
    next();

  } catch (err) {
    return res.status(403).json({ error: 'Token invalid or expired' });
  }
}

// Role guard — use after requireAuth
// Example: requireRole('admin') or requireRole(['admin', 'office'])
function requireRole(roles) {
  return (req, res, next) => {
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        required: allowed,
        your_role: req.user.role
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
