const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
 
// ── GET /api/trip-tickets/by-trip/:trip_id ────────────────────
// Get ticket for a specific trip (auto-creates draft if none exists)
router.get('/by-trip/:trip_id', async (req, res) => {
  try {
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('*, vessel:vessels(id,name)')
      .eq('id', req.params.trip_id)
      .eq('company_id', req.user.company_id)
      .single();
 
    if (tripErr || !trip) return res.status(404).json({ error: 'Trip not found' });
 
    let { data: ticket } = await supabase
      .from('trip_tickets')
      .select('*')
      .eq('trip_id', req.params.trip_id)
      .maybeSingle();
 
    // Auto-create draft ticket if none exists
    if (!ticket) {
      const today = new Date().toISOString().split('T')[0];
      const { data: newTicket, error: createErr } = await supabase
        .from('trip_tickets')
        .insert({
          company_id: req.user.company_id,
          trip_id: trip.id,
          vessel_id: trip.vessel_id,
          ticket_number: trip.trip_number || null,
          date: today,
          status: 'draft'
        })
        .select()
        .single();
      if (createErr) throw createErr;
      ticket = newTicket;
    }
 
    res.json({ ticket, trip });
  } catch (err) {
    console.error('GET ticket by trip error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trip ticket' });
  }
});
 
// ── GET /api/trip-tickets ─────────────────────────────────────
// Get all tickets for the company (history view)
router.get('/', async (req, res) => {
  try {
    const { vessel_id, status } = req.query;
    let query = supabase
      .from('trip_tickets')
      .select('*, trip:trips(id,status,departure_time,arrival_time), vessel:vessels(id,name)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false })
      .limit(100);
 
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    if (status) query = query.eq('status', status);
 
    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data });
  } catch (err) {
    console.error('GET tickets error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trip tickets' });
  }
});
 
// ── PUT /api/trip-tickets/:id ─────────────────────────────────
// Update/autosave a draft ticket — called frequently as user edits
router.put('/:id', async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('trip_tickets')
      .select('id, status, company_id')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
 
    if (!existing) return res.status(404).json({ error: 'Ticket not found' });
    if (existing.status === 'locked') {
      return res.status(403).json({ error: 'This ticket is locked — trip has been closed' });
    }
 
    const {
      ticket_number, date, time_ordered, job_number, destination,
      forklift, crane, legs, crew, billing_description,
      billing_hours, billing_rate, billing_total,
      pax_total, weather, sea_state, drills, notes
    } = req.body;
 
    const updates = { updated_at: new Date().toISOString() };
    if (ticket_number !== undefined) updates.ticket_number = ticket_number;
    if (date !== undefined) updates.date = date;
    if (time_ordered !== undefined) updates.time_ordered = time_ordered;
    if (job_number !== undefined) updates.job_number = job_number;
    if (destination !== undefined) updates.destination = destination;
    if (forklift !== undefined) updates.forklift = forklift;
    if (crane !== undefined) updates.crane = crane;
    if (legs !== undefined) updates.legs = legs;
    if (crew !== undefined) updates.crew = crew;
    if (billing_description !== undefined) updates.billing_description = billing_description;
    if (billing_hours !== undefined) updates.billing_hours = billing_hours;
    if (billing_rate !== undefined) updates.billing_rate = billing_rate;
    if (billing_total !== undefined) updates.billing_total = billing_total;
    if (pax_total !== undefined) updates.pax_total = pax_total;
    if (weather !== undefined) updates.weather = weather;
    if (sea_state !== undefined) updates.sea_state = sea_state;
    if (drills !== undefined) updates.drills = drills;
    if (notes !== undefined) updates.notes = notes;
 
    const { data, error } = await supabase
      .from('trip_tickets')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
 
    if (error) throw error;
    res.json({ ticket: data });
  } catch (err) {
    console.error('PUT ticket error:', err.message);
    res.status(500).json({ error: 'Failed to save ticket' });
  }
});
 
// ── PUT /api/trip-tickets/:id/lock ───────────────────────────
// Lock ticket when trip is closed — called by trips.js close route
router.put('/:id/lock', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trip_tickets')
      .update({
        status: 'locked',
        submitted_by: req.user.id,
        submitted_by_name: req.user.full_name,
        submitted_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
 
    if (error) throw error;
    res.json({ ticket: data });
  } catch (err) {
    console.error('PUT lock ticket error:', err.message);
    res.status(500).json({ error: 'Failed to lock ticket' });
  }
});
 
module.exports = router;
 