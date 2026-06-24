const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
 
router.use(requireAuth);
 
const ADMIN_ROLES = ['overlordadmin','company_admin'];
router.use(requireRole(ADMIN_ROLES));
 
const ALLOWED_ROLES = ['company_admin','port_engineer','vessel_ops_manager','office','crew','engineering_crew'];
 
// ── GET /api/admin/users ─────────────────────────────────────
router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, active, created_at')
    .eq('company_id', req.user.company_id)
    .order('full_name');
 
  if (error) return res.status(500).json({ error: 'Failed to fetch users' });
  res.json({ users: data });
});
 
// ── POST /api/admin/users ────────────────────────────────────
router.post('/users', async (req, res) => {
  const { full_name, email, password, role } = req.body;
  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password required' });
  }
  if (role && !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  try {
    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase
      .from('users')
      .insert({
        company_id: req.user.company_id,
        full_name, email: email.toLowerCase().trim(),
        password_hash, role: role || 'crew'
      })
      .select('id, full_name, email, role')
      .single();
 
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Email already in use' });
      throw error;
    }
    res.status(201).json({ user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', detail: err.message });
  }
});
 
// ── PUT /api/admin/users/:id/role ───────────────────────────
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const { data, error } = await supabase
    .from('users')
    .update({ role })
    .eq('id', req.params.id)
    .eq('company_id', req.user.company_id)
    .select('id, full_name, email, role')
    .single();
 
  if (error) return res.status(500).json({ error: 'Failed to update role' });
  if (!data) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'Role updated', user: data });
});
 
// ── PUT /api/admin/users/:id/deactivate ──────────────────────
router.put('/users/:id/deactivate', async (req, res) => {
  const { error } = await supabase
    .from('users')
    .update({ active: false })
    .eq('id', req.params.id)
    .eq('company_id', req.user.company_id);
 
  if (error) return res.status(500).json({ error: 'Failed to deactivate user' });
  res.json({ message: 'User deactivated' });
});
 
// ── GET /api/admin/company ───────────────────────────────────
router.get('/company', async (req, res) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, logo_url, subscription_tier, max_vessels, labor_label_1, labor_label_2, labor_label_3, created_at')
    .eq('id', req.user.company_id)
    .single();
 
  if (error) return res.status(500).json({ error: 'Failed to fetch company' });
  res.json({ company: data });
});
 
// ── PUT /api/admin/company/settings ──────────────────────────
router.put('/company/settings', async (req, res) => {
  const { labor_label_1, labor_label_2, labor_label_3 } = req.body;
  const updates = {};
  if (labor_label_1) updates.labor_label_1 = labor_label_1;
  if (labor_label_2) updates.labor_label_2 = labor_label_2;
  if (labor_label_3) updates.labor_label_3 = labor_label_3;
  const { error } = await supabase.from('companies').update(updates).eq('id', req.user.company_id);
  if (error) return res.status(500).json({ error: 'Failed to update settings' });
  res.json({ message: 'Settings updated' });
});
 
module.exports = router;
 