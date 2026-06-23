const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);

const MANAGE_ROLES = ['overlordadmin','company_admin','port_engineer','vessel_ops_manager'];

// ── GET /api/reports/compliance ───────────────────────────────
// Returns all voyage, maintenance, and drill data for a date range
// Frontend formats this as a printable HTML compliance report
router.get('/compliance', requireRole(MANAGE_ROLES), async (req, res) => {
  const { date_from, date_to, vessel_id } = req.query;
  const cid = req.user.company_id;

  if (!date_from || !date_to) {
    return res.status(400).json({ error: 'date_from and date_to are required' });
  }

  try {
    const [companyRes, vesselRes, tripsRes, ticketsRes, watchRes, maintRes, logsRes] = await Promise.all([
      supabase.from('companies').select('id,name').eq('id', cid).single(),
      supabase.from('vessels').select('id,name,vessel_type').eq('company_id', cid).order('name'),
      supabase.from('trips')
        .select('*,vessel:vessels(id,name)')
        .eq('company_id', cid)
        .eq('status', 'closed')
        .gte('arrival_time', date_from)
        .lte('arrival_time', date_to + 'T23:59:59Z')
        .order('departure_time'),
      supabase.from('trip_tickets')
        .select('*')
        .eq('company_id', cid)
        .eq('status', 'locked')
        .gte('submitted_at', date_from)
        .lte('submitted_at', date_to + 'T23:59:59Z'),
      supabase.from('trip_watch_entries')
        .select('*')
        .eq('company_id', cid)
        .gte('submitted_at', date_from)
        .lte('submitted_at', date_to + 'T23:59:59Z'),
      supabase.from('maintenance_log')
        .select('*,vessel:vessels(id,name)')
        .eq('company_id', cid)
        .eq('status', 'complete')
        .gte('completed_at', date_from)
        .lte('completed_at', date_to + 'T23:59:59Z'),
      supabase.from('logs')
        .select('*,vessel:vessels(id,name)')
        .eq('company_id', cid)
        .gte('log_date', date_from)
        .lte('log_date', date_to)
    ]);

    const tickets = ticketsRes.data || [];
    const trips = (tripsRes.data || []).map(t => ({
      ...t,
      ticket: tickets.find(tk => tk.trip_id === t.id) || null,
      watches: (watchRes.data || []).filter(w => w.trip_id === t.id)
    }));

    // Extract all drills from tickets
    const drills = [];
    tickets.forEach(tk => {
      const tripDrills = tk.drills || [];
      tripDrills.forEach(d => {
        if (d.type) drills.push({
          ...d,
          trip_id: tk.trip_id,
          vessel_id: tk.vessel_id,
          ticket_date: tk.date
        });
      });
    });

    let vessels = vesselRes.data || [];
    if (vessel_id) vessels = vessels.filter(v => v.id === vessel_id);

    res.json({
      company: companyRes.data,
      date_from,
      date_to,
      generated_at: new Date().toISOString(),
      generated_by: req.user.full_name,
      vessels,
      trips,
      drills,
      maintenance_completed: maintRes.data || [],
      engine_logs: logsRes.data || []
    });
  } catch (err) {
    console.error('Compliance report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report', detail: err.message });
  }
});

module.exports = router;
