const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// ── GET /api/logs ────────────────────────────────────────────
// Admin/office see all; crew see only their own submissions
router.get('/', async (req, res) => {
  const { vessel_id, date_from, date_to, flagged } = req.query;

  try {
    let query = supabase
      .from('logs')
      .select(`
        id, vessel_id, log_number, log_date, watch, engineer_name,
        engine_hours, fuel_level, crew_names, flag_count,
        completion_pct, submitted_at, notes,
        vessel:vessels(id, name, vessel_type)
      `)
      .eq('company_id', req.user.company_id)
      .order('submitted_at', { ascending: false });

    // Crew can only see their own logs
    if (req.user.role === 'crew') {
      query = query.eq('submitted_by', req.user.id);
    }

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
router.get('/:id', async (req, res) => {
  try {
    const { data: log, error } = await supabase
      .from('logs')
      .select(`*, vessel:vessels(id, name, vessel_type)`)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();

    if (error || !log) return res.status(404).json({ error: 'Log not found' });

    // Crew can only fetch their own logs
    if (req.user.role === 'crew' && log.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: checkItems } = await supabase
      .from('log_check_items')
      .select('*')
      .eq('log_id', req.params.id)
      .order('section');

    const { data: readings } = await supabase
      .from('log_readings')
      .select('*')
      .eq('log_id', req.params.id);

    res.json({ log, checkItems: checkItems || [], readings: readings || [] });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log detail' });
  }
});

// ── POST /api/logs ───────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    vessel_id, log_number, log_date, watch,
    engineer_name, submitted_by, engine_hours, fuel_level,
    crew_names, notes, flag_count, completion_pct,
    check_items, checks, readings
  } = req.body;

  if (!vessel_id || !log_number || !log_date) {
    return res.status(400).json({ error: 'vessel_id, log_number, and log_date are required' });
  }

  try {
    const { data: vessel } = await supabase
      .from('vessels')
      .select('id')
      .eq('id', vessel_id)
      .eq('company_id', req.user.company_id)
      .single();

    if (!vessel) return res.status(403).json({ error: 'Vessel not found or not yours' });

    const allItems = [];
    let computedFlags = 0, computedDone = 0, computedTotal = 0;

    // Accept flat check_items array from frontend: [{item_key, checked, flag}]
    if (check_items && Array.isArray(check_items)) {
      check_items.forEach(item => {
        computedTotal++;
        const status = item.checked
          ? (item.flag && item.flag !== 'ok' ? 'flag' : 'ok')
          : 'na';
        if (status === 'ok') computedDone++;
        if (status === 'flag') computedFlags++;
        const section = item.item_key.replace(/^checks-/, '').replace(/_\d+$/, '');
        allItems.push({
          company_id: req.user.company_id,
          section,
          item_label: item.item_key,
          status,
          is_custom: false
        });
      });
    }

    // Also accept grouped checks object for backward compat
    if (checks && typeof checks === 'object') {
      Object.entries(checks).forEach(([section, items]) => {
        items.forEach(item => {
          computedTotal++;
          if (item.status === 'ok') computedDone++;
          if (item.status === 'flag') computedFlags++;
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

    const finalCompletion = computedTotal > 0
      ? Math.round((computedDone / computedTotal) * 100)
      : (completion_pct || 0);
    const finalFlags = computedTotal > 0 ? computedFlags : (flag_count || 0);

    const { data: log, error: logErr } = await supabase
      .from('logs')
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        submitted_by: req.user.id,
        log_number, log_date, watch,
        engineer_name, engine_hours, fuel_level,
        crew_names: crew_names || [],
        notes,
        flag_count: finalFlags,
        completion_pct: finalCompletion
      })
      .select()
      .single();

    if (logErr) throw logErr;

    if (allItems.length > 0) {
      const { error: itemErr } = await supabase
        .from('log_check_items')
        .insert(allItems.map(i => ({ ...i, log_id: log.id })));
      if (itemErr) throw itemErr;
    }

    if (readings && readings.length > 0) {
      const { error: readErr } = await supabase
        .from('log_readings')
        .insert(readings.map(r => ({
          log_id: log.id,
          company_id: req.user.company_id,
          field_key: r.key,
          field_label: r.label,
          value: r.value,
          unit: r.unit
        })));
      if (readErr) throw readErr;
    }

    res.status(201).json({
      message: 'Log submitted',
      log_id: log.id,
      flag_count: finalFlags,
      completion_pct: finalCompletion
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to submit log', detail: err.message });
  }
});

// ── PUT /api/logs/:id ────────────────────────────────────────
// Edit a log within 30 minutes of submission
router.put('/:id', async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('logs')
      .select('id, submitted_at, submitted_by, company_id')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'Log not found' });

    // Only the submitter or admin/office can edit
    if (req.user.role === 'crew' && existing.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Enforce 30-minute window
    const ageMinutes = (Date.now() - new Date(existing.submitted_at).getTime()) / 60000;
    if (ageMinutes > 30) {
      return res.status(403).json({ error: 'Edit window has closed (30 minutes)' });
    }

    const {
      watch, engineer_name, engine_hours, fuel_level,
      notes, flag_count, completion_pct, check_items
    } = req.body;

    // Rebuild check items
    const allItems = [];
    let computedFlags = 0, computedDone = 0, computedTotal = 0;

    if (check_items && Array.isArray(check_items)) {
      check_items.forEach(item => {
        computedTotal++;
        const status = item.checked
          ? (item.flag && item.flag !== 'ok' ? 'flag' : 'ok')
          : 'na';
        if (status === 'ok') computedDone++;
        if (status === 'flag') computedFlags++;
        const section = item.item_key.replace(/^checks-/, '').replace(/_\d+$/, '');
        allItems.push({
          log_id: existing.id,
          company_id: req.user.company_id,
          section,
          item_label: item.item_key,
          status,
          is_custom: false
        });
      });
    }

    const finalCompletion = computedTotal > 0
      ? Math.round((computedDone / computedTotal) * 100)
      : (completion_pct || 0);
    const finalFlags = computedTotal > 0 ? computedFlags : (flag_count || 0);

    const { error: updateErr } = await supabase
      .from('logs')
      .update({
        watch, engineer_name, engine_hours, fuel_level, notes,
        flag_count: finalFlags,
        completion_pct: finalCompletion
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;

    // Replace check items
    if (allItems.length > 0) {
      await supabase.from('log_check_items').delete().eq('log_id', existing.id);
      const { error: itemErr } = await supabase.from('log_check_items').insert(allItems);
      if (itemErr) throw itemErr;
    }

    res.json({ message: 'Log updated', flag_count: finalFlags, completion_pct: finalCompletion });

  } catch (err) {
    res.status(500).json({ error: 'Failed to update log', detail: err.message });
  }
});

module.exports = router;
