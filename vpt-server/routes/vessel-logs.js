const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

// ── RADIO LOG ─────────────────────────────────────────────────
router.get('/radio-log', async (req, res) => {
  try {
    const { vessel_id, trip_id } = req.query;
    let q = supabase.from('radio_log_entries').select('*')
      .eq('company_id', req.user.company_id).order('log_time', { ascending: false }).limit(200);
    if (vessel_id) q = q.eq('vessel_id', vessel_id);
    if (trip_id) q = q.eq('trip_id', trip_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/radio-log', async (req, res) => {
  const { vessel_id, trip_id, log_time, channel, station_called, communication_type, message_summary, operator_name } = req.body;
  if (!vessel_id || !message_summary) return res.status(400).json({ error: 'vessel_id and message_summary required' });
  try {
    const { data, error } = await supabase.from('radio_log_entries').insert({
      company_id: req.user.company_id, vessel_id, trip_id: trip_id || null,
      log_time: log_time || new Date().toISOString(), channel, station_called,
      communication_type: communication_type || 'routine', message_summary,
      operator_name: operator_name || req.user.full_name, submitted_by: req.user.id
    }).select().single();
    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/radio-log/:id', async (req, res) => {
  try {
    await supabase.from('radio_log_entries').delete()
      .eq('id', req.params.id).eq('company_id', req.user.company_id);
    res.json({ message: 'Deleted' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── LOGBOOK ───────────────────────────────────────────────────
router.get('/logbook', async (req, res) => {
  try {
    const { vessel_id, trip_id } = req.query;
    let q = supabase.from('logbook_entries').select('*')
      .eq('company_id', req.user.company_id).order('entry_time', { ascending: false }).limit(100);
    if (vessel_id) q = q.eq('vessel_id', vessel_id);
    if (trip_id) q = q.eq('trip_id', trip_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/logbook', async (req, res) => {
  const { vessel_id, trip_id, entry_time, generator_in_use, steering_pump, entry_notes } = req.body;
  if (!vessel_id || !entry_notes) return res.status(400).json({ error: 'vessel_id and entry_notes required' });
  try {
    const { data, error } = await supabase.from('logbook_entries').insert({
      company_id: req.user.company_id, vessel_id, trip_id: trip_id || null,
      entry_time: entry_time || new Date().toISOString(),
      generator_in_use, steering_pump, entry_notes,
      submitted_by: req.user.id, submitted_by_name: req.user.full_name
    }).select().single();
    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WASTE MANAGEMENT ──────────────────────────────────────────
router.get('/waste-log', async (req, res) => {
  try {
    const { vessel_id } = req.query;
    let q = supabase.from('waste_management_log').select('*')
      .eq('company_id', req.user.company_id).order('created_at', { ascending: false }).limit(100);
    if (vessel_id) q = q.eq('vessel_id', vessel_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/waste-log', async (req, res) => {
  const { vessel_id, trip_id, log_date, garbage_disposed, disposal_location, disposal_method,
    oil_record_updated, sewage_discharged, sewage_location, notes } = req.body;
  if (!vessel_id) return res.status(400).json({ error: 'vessel_id required' });
  try {
    const { data, error } = await supabase.from('waste_management_log').insert({
      company_id: req.user.company_id, vessel_id, trip_id: trip_id || null,
      log_date: log_date || new Date().toISOString().split('T')[0],
      garbage_disposed: garbage_disposed || false, disposal_location, disposal_method,
      oil_record_updated: oil_record_updated || false,
      sewage_discharged: sewage_discharged || false, sewage_location, notes,
      submitted_by: req.user.id, submitted_by_name: req.user.full_name
    }).select().single();
    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PASSENGER MANIFEST ────────────────────────────────────────
router.get('/manifest', async (req, res) => {
  try {
    const { trip_id, vessel_id } = req.query;
    let q = supabase.from('passenger_manifests').select('*')
      .eq('company_id', req.user.company_id).order('leg_number');
    if (trip_id) q = q.eq('trip_id', trip_id);
    if (vessel_id) q = q.eq('vessel_id', vessel_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ manifests: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/manifest', async (req, res) => {
  const { vessel_id, trip_id, leg_number, leg_description, passengers } = req.body;
  if (!vessel_id || !trip_id) return res.status(400).json({ error: 'vessel_id and trip_id required' });
  try {
    const { data, error } = await supabase.from('passenger_manifests').insert({
      company_id: req.user.company_id, vessel_id, trip_id,
      leg_number: leg_number || 1, leg_description,
      passengers: passengers || [],
      total_pax: (passengers || []).length,
      submitted_by: req.user.id, submitted_by_name: req.user.full_name
    }).select().single();
    if (error) throw error;
    res.status(201).json({ manifest: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/manifest/:id', async (req, res) => {
  const { leg_description, passengers } = req.body;
  try {
    const { data, error } = await supabase.from('passenger_manifests').update({
      leg_description, passengers: passengers || [],
      total_pax: (passengers || []).length
    }).eq('id', req.params.id).eq('company_id', req.user.company_id).select().single();
    if (error) throw error;
    res.json({ manifest: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── MONTHLY CHECKLIST ─────────────────────────────────────────
router.get('/monthly-checklist', async (req, res) => {
  try {
    const { vessel_id, month } = req.query;
    let q = supabase.from('monthly_checklists').select('*')
      .eq('company_id', req.user.company_id).order('checklist_month', { ascending: false });
    if (vessel_id) q = q.eq('vessel_id', vessel_id);
    if (month) q = q.eq('checklist_month', month + '-01');
    const { data, error } = await q;
    if (error) throw error;
    res.json({ checklists: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/monthly-checklist', async (req, res) => {
  const { vessel_id, checklist_month, items, status } = req.body;
  if (!vessel_id || !checklist_month) return res.status(400).json({ error: 'vessel_id and checklist_month required' });
  try {
    const monthDate = checklist_month.length === 7 ? checklist_month + '-01' : checklist_month;
    const { data, error } = await supabase.from('monthly_checklists').upsert({
      company_id: req.user.company_id, vessel_id,
      checklist_month: monthDate,
      items: items || [],
      status: status || 'draft',
      submitted_by: req.user.id, submitted_by_name: req.user.full_name,
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,vessel_id,checklist_month' }).select().single();
    if (error) throw error;
    res.status(201).json({ checklist: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/monthly-checklist/:id', async (req, res) => {
  const { items, status, reviewer_notes } = req.body;
  try {
    const { data, error } = await supabase.from('monthly_checklists').update({
      items, status, reviewer_notes, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).eq('company_id', req.user.company_id).select().single();
    if (error) throw error;
    res.json({ checklist: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
