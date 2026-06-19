const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
  try {
    const { data } = await supabase.from('maintenance_logs').select('*, vessel:vessels(id, name)').eq('company_id', req.user.company_id);
    res.json({ logs: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.get('/:id', async (req, res) => {
  try {
    const { data } = await supabase.from('maintenance_logs').select('*').eq('id', req.params.id).single();
    res.json({ log: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.put('/:id/status', async (req, res) => {
  try {
    const { status, work_performed } = req.body;
    await supabase.from('maintenance_logs').update({ status, work_performed }).eq('id', req.params.id);
    res.json({ message: 'Updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
