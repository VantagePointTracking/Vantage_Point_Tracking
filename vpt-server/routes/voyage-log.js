const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
 
// ── GET /api/voyage-log ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { vessel_id, trip_id, limit } = req.query;
    let query = supabase
      .from('voyage_log_entries')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('entry_time', { ascending: false })
      .limit(parseInt(limit) || 100);
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    if (trip_id) query = query.eq('trip_id', trip_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch voyage log' });
  }
});
 
// ── POST /api/voyage-log ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { vessel_id, trip_id, entry_time, entry_type, position_desc, course, speed, weather, notes } = req.body;
  if (!vessel_id || !entry_type || !notes) {
    return res.status(400).json({ error: 'vessel_id, entry_type, and notes are required' });
  }
  try {
    const { data, error } = await supabase
      .from('voyage_log_entries')
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        trip_id: trip_id || null,
        entry_time: entry_time || new Date().toISOString(),
        entry_type,
        position_desc: position_desc || null,
        course: course || null,
        speed: speed || null,
        weather: weather || null,
        notes,
        submitted_by: req.user.id,
        submitted_by_name: req.user.full_name
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create log entry', detail: err.message });
  }
});
 
// ── DELETE /api/voyage-log/:id ────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('voyage_log_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .eq('submitted_by', req.user.id); // can only delete own entries
    if (error) throw error;
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});
 
module.exports = router;
 