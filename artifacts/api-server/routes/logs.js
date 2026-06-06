const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// ── GET /api/logs ────────────────────────────────────────────
// Get all logs for this company (office/admin view)
router.get('/', requireRole(['admin', 'office']), async (req, res) => {
  const { vessel_id, date_from, date_to, flagged } = req.query;

  try {
    let query = supabase
      .from('logs')
      .select(`
        id, log_number, log_date, watch, engineer_name,
        engine_hours, fuel_level, crew_names, flag_count,
        completion_pct, submitted_at,
        vessel:vessels(id, name, vessel_type)
      `)
      .eq('company_id', req.user.company_id)
      .order('submitted_at', { ascending: false });

    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    if (date_from) query = query.gte('log_date', date_from);
    if (date_to)   query = query.lte('log_date', date_to);
    if (flagged === 'true') query = query.gt('flag_count', 0);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ logs: data });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── GET /api/logs/:id ────────────────────────────────────────
// Get full detail of one log (all check items + readings)
router.get('/:id', async (req, res) => {
  try {
    const { data: log, error } = await supabase
      .from('logs')
      .select(`
        *,
        vessel:vessels(id, name, vessel_type)
      `)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id) // tenant safety
      .single();

    if (error || !log) return res.status(404).json({ error: 'Log not found' });

    const { data: checkItems } = await supabase
      .from('log_check_items')
      .select('*')
      .eq('log_id', req.params.id)
      .order('section');

    const { data: readings } = await supabase
      .from('log_readings')
      .select('*')
      .eq('log_id', req.params.id);

    res.json({ log, checkItems, readings });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log detail' });
  }
});

// ── POST /api/logs ───────────────────────────────────────────
// Submit a new log (crew)
router.post('/', async (req, res) => {
  const {
    vessel_id, log_number, log_date, watch,
    engineer_name, engine_hours, fuel_level,
    crew_names, notes, checks, readings
  } = req.body;

  if (!vessel_id || !log_number || !log_date) {
    return res.status(400).json({ error: 'vessel_id, log_number, and log_date are required' });
  }

  try {
    // Confirm vessel belongs to this company
    const { data: vessel } = await supabase
      .from('vessels')
      .select('id')
      .eq('id', vessel_id)
      .eq('company_id', req.user.company_id)
      .single();

    if (!vessel) return res.status(403).json({ error: 'Vessel not found or not yours' });

    // Count flags and completion
    let flagCount = 0, doneCount = 0, totalCount = 0;
    const allItems = [];

    if (checks) {
      Object.entries(checks).forEach(([section, items]) => {
        items.forEach(item => {
          totalCount++;
          if (item.status === 'ok') doneCount++;
          if (item.status === 'flag') flagCount++;
          allItems.push({
            company_id: req.user.company_id,
            section,
            item_label: item.label,
            status: item.status || 'na',
            is_custom: item.is_custom || false
          });
        });
      });
    }

    const completion_pct = totalCount > 0
      ? Math.round((doneCount / totalCount) * 100)
      : 0;

    // Insert log record
    const { data: log, error: logErr } = await supabase
      .from('logs')
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        submitted_by: req.user.id,
        log_number, log_date, watch,
        engineer_name, engine_hours, fuel_level,
        crew_names: crew_names || [],
        notes, flag_count: flagCount, completion_pct
      })
      .select()
      .single();

    if (logErr) throw logErr;

    // Insert check items
    if (allItems.length > 0) {
      const itemsWithLog = allItems.map(i => ({ ...i, log_id: log.id }));
      const { error: itemErr } = await supabase
        .from('log_check_items')
        .insert(itemsWithLog);
      if (itemErr) throw itemErr;
    }

    // Insert readings
    if (readings && readings.length > 0) {
      const readingsWithLog = readings.map(r => ({
        log_id: log.id,
        company_id: req.user.company_id,
        field_key: r.key,
        field_label: r.label,
        value: r.value,
        unit: r.unit
      }));
      const { error: readErr } = await supabase
        .from('log_readings')
        .insert(readingsWithLog);
      if (readErr) throw readErr;
    }

    res.status(201).json({
      message: 'Log submitted',
      log_id: log.id,
      flag_count: flagCount,
      completion_pct
    });

  } catch (err) {
    console.error('Submit log error:', err);
    res.status(500).json({ error: 'Failed to submit log', detail: err.message });
  }
});

module.exports = router;
