const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendMaintenanceAlert } = require('../lib/email');
const router = express.Router();
 
router.use(requireAuth);
 
const MANAGE_ROLES = ['overlordadmin','company_admin','port_engineer','vessel_ops_manager'];
const ENG_READ_ROLES = [...MANAGE_ROLES, 'engineering_crew'];
const ENG_WRITE_ROLES = [...MANAGE_ROLES, 'engineering_crew'];
 
// ── POST /api/maintenance/orders ─────────────────────────────
router.post('/orders', async (req, res) => {
  const { vessel_id, system, component, description, error_codes, priority } = req.body;
  if (!vessel_id || !system || !description) {
    return res.status(400).json({ error: 'vessel_id, system, and description are required' });
  }
  try {
    const { data: order, error } = await supabase
      .from('maintenance_orders')
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        submitted_by: req.user.id,
        submitter_name: req.user.full_name,
        system,
        component: component || null,
        description,
        error_codes: error_codes || null,
        priority: priority || 'medium',
        status: 'pending_review'
      })
      .select()
      .single();
 
    if (error) throw error;
 
    const { data: vessel } = await supabase
      .from('vessels')
      .select('name')
      .eq('id', vessel_id)
      .single();
 
    const { data: managers } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('company_id', req.user.company_id)
      .in('role', ['overlordadmin', 'port_engineer', 'vessel_ops_manager', 'company_admin'])
      .eq('active', true);
 
    if (managers && managers.length > 0) {
      await supabase.from('notifications').insert(
        managers.map(m => ({
          company_id: req.user.company_id,
          user_id: m.id,
          type: 'maintenance_order',
          title: 'New maintenance order',
          message: `${req.user.full_name} flagged an issue on ${vessel ? vessel.name : 'a vessel'}: ${system}${component ? ' - ' + component : ''}`,
          reference_id: order.id,
          read: false
        }))
      );
 
      await sendMaintenanceAlert({
        managers,
        submitterName: req.user.full_name,
        vesselName: vessel ? vessel.name : 'Unknown vessel',
        system,
        component,
        description,
        priority: priority || 'medium',
        orderId: order.id
      });
    }
 
    res.status(201).json({ message: 'Maintenance order submitted', order });
  } catch (err) {
    console.error('POST orders error:', err.message);
    res.status(500).json({ error: 'Failed to submit maintenance order', detail: err.message });
  }
});
 
// ── GET /api/maintenance/orders ──────────────────────────────
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('maintenance_orders')
      .select('*, vessel:vessels(id,name)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });
 
    if (status) query = query.eq('status', status);
 
    const { data, error } = await query;
    if (error) throw error;
    res.json({ orders: data });
  } catch (err) {
    console.error('GET orders error:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
 
// ── PUT /api/maintenance/orders/:id/dismiss ──────────────────
router.put('/orders/:id/dismiss', requireRole(MANAGE_ROLES), async (req, res) => {
  const { note } = req.body;
  try {
    const { error } = await supabase
      .from('maintenance_orders')
      .update({ status: 'dismissed', review_note: note || null, reviewed_by: req.user.id })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
 
    if (error) throw error;
 
    await supabase.from('notifications')
      .update({ read: true })
      .eq('reference_id', req.params.id)
      .eq('company_id', req.user.company_id);
 
    res.json({ message: 'Order dismissed' });
  } catch (err) {
    console.error('PUT dismiss error:', err.message);
    res.status(500).json({ error: 'Failed to dismiss order' });
  }
});
 
// ── PUT /api/maintenance/orders/:id/approve ──────────────────
router.put('/orders/:id/approve', requireRole(MANAGE_ROLES), async (req, res) => {
  const { priority, assigned_to, parts_needed, notes } = req.body;
  try {
    const { data: order, error: fetchErr } = await supabase
      .from('maintenance_orders')
      .select('*, vessel:vessels(id,name)')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .single();
 
    if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
 
    const { data: logEntry, error: logErr } = await supabase
      .from('maintenance_log')
      .insert({
        company_id: req.user.company_id,
        vessel_id: order.vessel_id,
        system: order.system,
        component: order.component,
        description: order.description,
        error_codes: order.error_codes,
        priority: priority || order.priority,
        status: 'open',
        reported_by: order.submitter_name,
        assigned_to: assigned_to || null,
        parts_needed: parts_needed || null,
        notes: notes || null,
        source_order_id: order.id
      })
      .select()
      .single();
 
    if (logErr) throw logErr;
 
    await supabase.from('work_order_history').insert({
      company_id: req.user.company_id,
      maintenance_log_id: logEntry.id,
      changed_by_name: req.user.full_name,
      old_status: null,
      new_status: 'open',
      note: 'Work order created'
    });
 
    await supabase.from('maintenance_orders')
      .update({ status: 'approved', reviewed_by: req.user.id, maintenance_log_id: logEntry.id })
      .eq('id', req.params.id);
 
    await supabase.from('notifications')
      .update({ read: true })
      .eq('reference_id', req.params.id)
      .eq('company_id', req.user.company_id);
 
    res.json({ message: 'Approved and added to maintenance log', log_entry: logEntry });
  } catch (err) {
    console.error('PUT approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve order', detail: err.message });
  }
});
 
// ── GET /api/maintenance/log ─────────────────────────────────
router.get('/log', requireRole(ENG_READ_ROLES), async (req, res) => {
  try {
    const { vessel_id, status } = req.query;
    let query = supabase
      .from('maintenance_log')
      .select('*, vessel:vessels(id,name)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });
 
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    if (status) query = query.eq('status', status);
 
    const { data, error } = await query;
    if (error) throw error;
    res.json({ entries: data });
  } catch (err) {
    console.error('GET log error:', err.message);
    res.status(500).json({ error: 'Failed to fetch maintenance log' });
  }
});
 
// ── PUT /api/maintenance/log/:id ─────────────────────────────
router.put('/log/:id', requireRole(ENG_WRITE_ROLES), async (req, res) => {
  const { status, assigned_to, parts_needed, notes, work_performed } = req.body;
  const allowed = ['open', 'in_progress', 'awaiting_parts', 'complete'];
  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const { data: existing } = await supabase
      .from('maintenance_log')
      .select('status')
      .eq('id', req.params.id)
      .single();
 
    const updates = {};
    if (status) updates.status = status;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (parts_needed !== undefined) updates.parts_needed = parts_needed;
    if (notes !== undefined) updates.notes = notes;
    if (work_performed !== undefined) updates.work_performed = work_performed;
    if (status === 'complete') updates.completed_at = new Date().toISOString();
 
    const { data, error } = await supabase
      .from('maintenance_log')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
 
    if (error) throw error;
 
    if (status && existing && existing.status !== status) {
      const histRes = await supabase.from('work_order_history').insert({
        company_id: req.user.company_id,
        maintenance_log_id: req.params.id,
        changed_by_name: req.user.full_name,
        old_status: existing.status,
        new_status: status,
        note: work_performed || null
      });
      console.log('History insert:', histRes.error ? histRes.error.message : 'OK');
    }
 
    res.json({ message: 'Work order updated', entry: data });
  } catch (err) {
    console.error('PUT log error:', err.message);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});
 
// ── GET /api/maintenance/notifications ───────────────────────
router.get('/notifications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false })
      .limit(50);
 
    if (error) throw error;
    const unread = (data || []).filter(n => !n.read).length;
    res.json({ notifications: data || [], unread });
  } catch (err) {
    console.error('GET notifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});
 
// ── PUT /api/maintenance/notifications/read-all ──────────────
router.put('/notifications/read-all', async (req, res) => {
  try {
    await supabase.from('notifications')
      .update({ read: true })
      .eq('user_id', req.user.id)
      .eq('company_id', req.user.company_id);
    res.json({ message: 'All notifications marked read' });
  } catch (err) {
    console.error('PUT read-all error:', err.message);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});
 
module.exports = router;