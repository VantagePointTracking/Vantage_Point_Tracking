const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
 
// ── GET /api/purchase-orders ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { vessel_id, status } = req.query;
    let query = supabase
      .from('purchase_orders')
      .select('*, vessel:vessels(id,name)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ purchase_orders: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});
 
// ── POST /api/purchase-orders ─────────────────────────────────
router.post('/', async (req, res) => {
  const { vessel_id, po_number, date, ship_to, vendor, ordered_by, line_items, subtotal, notes } = req.body;
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        company_id: req.user.company_id,
        vessel_id: vessel_id || null,
        po_number: po_number || null,
        date: date || new Date().toISOString().split('T')[0],
        ship_to: ship_to || null,
        vendor: vendor || null,
        ordered_by: ordered_by || req.user.full_name,
        line_items: line_items || [],
        subtotal: subtotal || null,
        notes: notes || null,
        status: 'submitted',
        submitted_by: req.user.id,
        submitted_by_name: req.user.full_name,
        submitted_at: new Date().toISOString()
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ purchase_order: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create purchase order', detail: err.message });
  }
});
 
// ── PUT /api/purchase-orders/:id ──────────────────────────────
router.put('/:id', async (req, res) => {
  const { vessel_id, po_number, date, ship_to, vendor, ordered_by, line_items, subtotal, notes, status } = req.body;
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (vessel_id !== undefined) updates.vessel_id = vessel_id;
    if (po_number !== undefined) updates.po_number = po_number;
    if (date !== undefined) updates.date = date;
    if (ship_to !== undefined) updates.ship_to = ship_to;
    if (vendor !== undefined) updates.vendor = vendor;
    if (ordered_by !== undefined) updates.ordered_by = ordered_by;
    if (line_items !== undefined) updates.line_items = line_items;
    if (subtotal !== undefined) updates.subtotal = subtotal;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) updates.status = status;
 
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ purchase_order: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
});
 
// ── GET /api/purchase-orders/:id ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, vessel:vessels(id,name)')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ purchase_order: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});
 
module.exports = router;
 