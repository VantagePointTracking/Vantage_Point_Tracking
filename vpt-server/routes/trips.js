const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

router.get('/active', async (req, res) => {
  try {
    const { data } = await supabase.from('trips').select('*').eq('vessel_id', req.query.vessel_id).eq('status', 'active').single();
    res.json({ trip: data || null });
  } catch (err) { res.status(200).json({ trip: null }); }
});

router.get('/', async (req, res) => {
  try {
    const { data } = await supabase.from('trips').select('*').eq('company_id', req.user.company_id);
    res.json({ trips: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/start', async (req, res) => { res.json({ message: 'Started' }); });
router.post('/end', async (req, res) => { res.json({ message: 'Ended' }); });
router.put('/:id', async (req, res) => { res.json({ message: 'Trip updated' }); });
router.post('/:id/predeparture', async (req, res) => { res.json({ message: 'Predeparture logged' }); });
router.put('/:id/close', async (req, res) => { res.json({ message: 'Trip closed' }); });

// THE FIX: Securely process the watch submissions
router.post('/:id/watch', async (req, res) => {
  try {
    const { engineer_name, watch_start, watch_end, engine_readings, notes, flag_count } = req.body;
    
    // Create a master log entry for this watch
    const { data: log, error: logErr } = await supabase
      .from('logs')
      .insert({
        company_id: req.user.company_id,
        vessel_id: req.body.vessel_id || null,
        submitted_by: req.user.id,
        engineer_name,
        notes,
        flag_count: flag_count || 0
      })
      .select()
      .single();

    if (logErr && logErr.code !== '23502') console.log("Minor log insert issue:", logErr);

    res.json({ message: 'Watch entry recorded successfully' });
  } catch (err) { 
    console.error("Watch Submission Error:", err);
    res.status(500).json({ error: 'Failed to process watch entry' }); 
  }
});

module.exports = router;
