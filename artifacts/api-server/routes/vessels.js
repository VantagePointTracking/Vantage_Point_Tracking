const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

// All vessel routes require login
router.use(requireAuth);

// ── GET /api/vessels ─────────────────────────────────────────
// Get all vessels for the logged-in user's company
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vessels')
      .select('*')
      .eq('company_id', req.user.company_id)
      .eq('active', true)
      .order('name');

    if (error) throw error;
    res.json({ vessels: data });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vessels' });
  }
});

// ── GET /api/vessels/:id ─────────────────────────────────────
// Get a single vessel by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vessels')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id) // tenant safety
      .single();

    if (error || !data) return res.status(404).json({ error: 'Vessel not found' });
    res.json({ vessel: data });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vessel' });
  }
});

// ── POST /api/vessels ────────────────────────────────────────
// Add a new vessel — admin only
router.post('/', requireRole(['admin']), async (req, res) => {
  const { name, vessel_type, year_built, registration, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Vessel name required' });

  try {
    // Check vessel limit for subscription tier
    const { count } = await supabase
      .from('vessels')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.user.company_id)
      .eq('active', true);

    const { data: company } = await supabase
      .from('companies')
      .select('max_vessels')
      .eq('id', req.user.company_id)
      .single();

    if (count >= company.max_vessels) {
      return res.status(403).json({
        error: `Vessel limit reached (${company.max_vessels} on your plan). Upgrade to add more.`
      });
    }

    const { data, error } = await supabase
      .from('vessels')
      .insert({
        company_id: req.user.company_id,
        name, vessel_type, year_built, registration, notes
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ vessel: data });

  } catch (err) {
    res.status(500).json({ error: 'Failed to create vessel', detail: err.message });
  }
});

// ── PUT /api/vessels/:id ─────────────────────────────────────
// Update a vessel — admin only
router.put('/:id', requireRole(['admin']), async (req, res) => {
  const { name, vessel_type, year_built, registration, notes } = req.body;

  try {
    const { data, error } = await supabase
      .from('vessels')
      .update({ name, vessel_type, year_built, registration, notes })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id) // tenant safety
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Vessel not found' });
    res.json({ vessel: data });

  } catch (err) {
    res.status(500).json({ error: 'Failed to update vessel' });
  }
});

// ── DELETE /api/vessels/:id ──────────────────────────────────
// Soft delete (sets active=false) — admin only
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { error } = await supabase
      .from('vessels')
      .update({ active: false })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);

    if (error) throw error;
    res.json({ message: 'Vessel removed' });

  } catch (err) {
    res.status(500).json({ error: 'Failed to remove vessel' });
  }
});

module.exports = router;
