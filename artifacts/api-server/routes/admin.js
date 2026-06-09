const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);
router.use(requireRole(['admin']));
// All routes in this file: admin only

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
// Add crew/office user to the company
router.post('/users', async (req, res) => {
  const { full_name, email, password, role } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password required' });
  }

  const allowed_roles = ['admin', 'office', 'crew'];
  if (role && !allowed_roles.includes(role)) {
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
// Change a user's role
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  const allowed_roles = ['admin', 'office', 'crew'];
  if (!role || !allowed_roles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, office, or crew.' });
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

// ── GET /api/admin/custom-sections ──────────────────────────
router.get('/custom-sections', async (req, res) => {
  const { data, error } = await supabase
    .from('custom_sections')
    .select('*, custom_fields(*)')
    .eq('company_id', req.user.company_id)
    .eq('active', true)
    .order('display_order');

  if (error) return res.status(500).json({ error: 'Failed to fetch sections' });
  res.json({ sections: data });
});

// ── POST /api/admin/custom-sections ─────────────────────────
// Add a custom checklist section (e.g. "Winch Systems" for tugs)
router.post('/custom-sections', async (req, res) => {
  const { section_name, display_order } = req.body;
  if (!section_name) return res.status(400).json({ error: 'section_name required' });

  const { data, error } = await supabase
    .from('custom_sections')
    .insert({ company_id: req.user.company_id, section_name, display_order: display_order || 99 })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create section' });
  res.status(201).json({ section: data });
});

// ── POST /api/admin/custom-fields ───────────────────────────
// Add a field to a custom section
router.post('/custom-fields', async (req, res) => {
  const { section_id, field_label, field_type, unit, display_order } = req.body;
  if (!section_id || !field_label) {
    return res.status(400).json({ error: 'section_id and field_label required' });
  }

  // Confirm section belongs to this company
  const { data: section } = await supabase
    .from('custom_sections')
    .select('id')
    .eq('id', section_id)
    .eq('company_id', req.user.company_id)
    .single();

  if (!section) return res.status(403).json({ error: 'Section not found' });

  const { data, error } = await supabase
    .from('custom_fields')
    .insert({
      section_id,
      company_id: req.user.company_id,
      field_label,
      field_type: field_type || 'check',
      unit,
      display_order: display_order || 99
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to create field' });
  res.status(201).json({ field: data });
});

// ── GET /api/admin/company ───────────────────────────────────
router.get('/company', async (req, res) => {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, logo_url, subscription_tier, max_vessels, created_at')
    .eq('id', req.user.company_id)
    .single();

  if (error) return res.status(500).json({ error: 'Failed to fetch company' });
  res.json({ company: data });
});

module.exports = router;
