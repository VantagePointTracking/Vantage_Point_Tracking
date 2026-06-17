const express = require('express');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
 
const MANAGE_ROLES = ['overlordadmin','company_admin','port_engineer','vessel_ops_manager'];
 
// ── GET /api/fleet/status ─────────────────────────────────────
// Vessel status board — certs + open maintenance + engine hours
router.get('/status', async (req, res) => {
  try {
    const cid = req.user.company_id;
    const today = new Date().toISOString().split('T')[0];
 
    const [vRes, certRes, maintRes, logRes] = await Promise.all([
      supabase.from('vessels').select('id,name,vessel_type').eq('company_id', cid).order('name'),
      supabase.from('certificates').select('*').eq('company_id', cid),
      supabase.from('maintenance_log').select('id,vessel_id,status,priority,system,component').eq('company_id', cid).neq('status','complete'),
      supabase.from('logs').select('vessel_id,log_date,engine_hours').eq('company_id', cid).order('submitted_at', {ascending:false}).limit(200)
    ]);
 
    const vessels = vRes.data || [];
    const certs = certRes.data || [];
    const openMaint = maintRes.data || [];
    const recentLogs = logRes.data || [];
 
    const status = vessels.map(v => {
      // Certificate alerts
      const vCerts = certs.filter(c => c.vessel_id === v.id);
      const certAlerts = vCerts.filter(c => {
        if (!c.expiry_date) return false;
        const daysLeft = Math.floor((new Date(c.expiry_date) - new Date(today)) / 86400000);
        return daysLeft <= c.alert_threshold_days;
      });
      const expiredCerts = certAlerts.filter(c => new Date(c.expiry_date) < new Date(today));
 
      // Open maintenance
      const vMaint = openMaint.filter(m => m.vessel_id === v.id);
      const highPriority = vMaint.filter(m => m.priority === 'high');
 
      // Latest engine hours
      const vLogs = recentLogs.filter(l => l.vessel_id === v.id);
      const latestLog = vLogs[0];
      const latestHours = latestLog ? latestLog.engine_hours : null;
      const lastLogDate = latestLog ? latestLog.log_date : null;
 
      // Overall status
      let overallStatus = 'green';
      let alerts = [];
 
      if (expiredCerts.length > 0) {
        overallStatus = 'red';
        expiredCerts.forEach(c => alerts.push({ type: 'cert_expired', message: c.document_type + ' EXPIRED' }));
      }
      if (highPriority.length > 0) {
        overallStatus = 'red';
        highPriority.forEach(m => alerts.push({ type: 'maint_high', message: 'High priority: ' + m.system + (m.component ? ' - ' + m.component : '') }));
      }
      if (overallStatus === 'green' && certAlerts.length > 0) {
        overallStatus = 'amber';
        certAlerts.forEach(c => {
          const daysLeft = Math.floor((new Date(c.expiry_date) - new Date(today)) / 86400000);
          alerts.push({ type: 'cert_due', message: c.document_type + ' due in ' + daysLeft + ' days' });
        });
      }
      if (overallStatus === 'green' && vMaint.length > 0) {
        overallStatus = 'amber';
        alerts.push({ type: 'maint_open', message: vMaint.length + ' open work order' + (vMaint.length > 1 ? 's' : '') });
      }
 
      return {
        vessel_id: v.id,
        vessel_name: v.name,
        status: overallStatus,
        alerts,
        open_work_orders: vMaint.length,
        high_priority_count: highPriority.length,
        cert_alerts: certAlerts.length,
        latest_engine_hours: latestHours,
        last_log_date: lastLogDate
      };
    });
 
    res.json({ status });
  } catch(err) {
    res.status(500).json({ error: 'Failed to fetch fleet status', detail: err.message });
  }
});
 
// ── GET /api/fleet/certificates ───────────────────────────────
router.get('/certificates', requireRole(MANAGE_ROLES), async (req, res) => {
  try {
    const { vessel_id } = req.query;
    let query = supabase.from('certificates').select('*, vessel:vessels(id,name)')
      .eq('company_id', req.user.company_id).order('expiry_date');
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ certificates: data });
  } catch(err) {
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});
 
// ── PUT /api/fleet/certificates/:id ──────────────────────────
router.put('/certificates/:id', requireRole(MANAGE_ROLES), async (req, res) => {
  const { issue_date, expiry_date, last_annual, notes } = req.body;
  try {
    const { data, error } = await supabase.from('certificates')
      .update({ issue_date, expiry_date, last_annual, notes })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select().single();
    if (error) throw error;
    res.json({ certificate: data });
  } catch(err) {
    res.status(500).json({ error: 'Failed to update certificate' });
  }
});
 
// ── GET /api/fleet/work-order-history/:id ─────────────────────
router.get('/work-order-history/:id', requireRole(MANAGE_ROLES), async (req, res) => {
  try {
    const { data, error } = await supabase.from('work_order_history')
      .select('*')
      .eq('maintenance_log_id', req.params.id)
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ history: data || [] });
  } catch(err) {
    res.status(500).json({ error: 'Failed to fetch work order history' });
  }
});
 
// ── GET /api/fleet/engines ────────────────────────────────────
router.get('/engines', async (req, res) => {
  try {
    const { vessel_id } = req.query;
    let query = supabase.from('vessel_engines').select('*')
      .eq('company_id', req.user.company_id).order('position');
    if (vessel_id) query = query.eq('vessel_id', vessel_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ engines: data || [] });
  } catch(err) {
    res.status(500).json({ error: 'Failed to fetch engines' });
  }
});
 
module.exports = router;