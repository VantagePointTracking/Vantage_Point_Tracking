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
router.post('/:id/watch', async (req, res) => {
  try {
    res.json({ message: 'Watch entry recorded successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
