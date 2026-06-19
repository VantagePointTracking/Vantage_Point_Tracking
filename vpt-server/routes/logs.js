const express = require("express");
const supabase = require("../lib/supabase");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

// All log sheets routes require explicit session login authentication
router.use(requireAuth);

// ── GET /api/logs ────────────────────────────────────────────
// Admin/office see all fleet logs; crew see only their own submissions
router.get("/", async (req, res) => {
  const { vessel_id, date_from, date_to, flagged } = req.query;

  try {
    let query = supabase
      .from("logs")
      .select(
        `
        id, vessel_id, log_number, log_date, watch, engineer_name,
        engine_hours, fuel_level, crew_names, flag_count,
        completion_pct, submitted_at, notes,
        vessel:vessels(id, name, vessel_type)
      `,
      )
      .eq("company_id", req.user.company_id)
      .order("submitted_at", { ascending: false });

    // Crew access restriction rule
    if (req.user.role === "crew") {
      query = query.eq("submitted_by", req.user.id);
    }

    if (vessel_id) query = query.eq("vessel_id", vessel_id);
    if (date_from) query = query.gte("log_date", date_from);
    if (date_to) query = query.lte("log_date", date_to);
    if (flagged === "true") query = query.gt("flag_count", 0);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ logs: data });
  } catch (err) {
    console.error("Fetch logs error:", err.message);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// ── GET /api/logs/:id ────────────────────────────────────────
// Fetch comprehensive metadata for a specific engine room log log entry
router.get("/:id", async (req, res) => {
  try {
    const { data: log, error } = await supabase
      .from("logs")
      .select(`*, vessel:vessels(id, name, vessel_type)`)
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id)
      .single();

    if (error || !log) return res.status(404).json({ error: "Log not found" });

    // Crew validation gate
    if (req.user.role === "crew" && log.submitted_by !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Access denied: Unauthorized entry record" });
    }

    const { data: checkItems } = await supabase
      .from("log_check_items")
      .select("*")
      .eq("log_id", req.params.id)
      .order("section");

    const { data: readings } = await supabase
      .from("log_readings")
      .select("*")
      .eq("log_id", req.params.id);

    res.json({ log, checkItems: checkItems || [], readings: readings || [] });
  } catch (err) {
    console.error("Fetch log detail error:", err.message);
    res.status(500).json({ error: "Failed to fetch log details" });
  }
});

// ── POST /api/logs ───────────────────────────────────────────
// Submit a new daily log with support for multi-engine readings and multiple watch shifts
router.post('/', async (req, res) => {
  const {
    vessel_id, log_number, log_date,
    engineer_name, engine_hours, fuel_level,
    crew_names, notes, flag_count, completion_pct,
    check_items, checks, readings, watches
  } = req.body;

  if (!vessel_id || !log_number || !log_date) {
    return res.status(400).json({ error: 'vessel_id, log_number, and log_date are required' });
  }

  try {
    // 1. Tenant Isolation Check: Verify vessel ownership
    const { data: vessel } = await supabase
      .from('vessels')
      .select('id')
      .eq('id', vessel_id)
      .eq('company_id', req.user.company_id)
      .single();

    if (!vessel) return res.status(403).json({ error: 'Vessel not found or unauthorized access' });

    const allItems = [];
    let computedFlags = 0, computedDone = 0, computedTotal = 0;

    // 2. Process check_items array from mobile UI
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
          section: section || 'general',
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

    // 3. Write Master Log Entry (Notice: old single 'watch' column is removed here)
    const { data: log, error: logErr } = await supabase
      .from('logs')
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        submitted_by: req.user.id,
        log_number, log_date,
        engineer_name, engine_hours, fuel_level,
        crew_names: crew_names || [],
        notes,
        flag_count: finalFlags,
        completion_pct: finalCompletion
      })
      .select()
      .single();

    if (logErr) throw logErr;

    // 4. Insert checklist items
    if (allItems.length > 0) {
      const { error: itemErr } = await supabase
        .from('log_check_items')
        .insert(allItems.map(i => ({ ...i, log_id: log.id })));
      if (itemErr) throw itemErr;
    }

    // 5. Insert Multi-Engine Telemetry mappings
    if (readings && readings.length > 0) {
      const { error: readErr } = await supabase
        .from('log_readings')
        .insert(readings.map(r => ({
          log_id: log.id,
          company_id: req.user.company_id,
          engine_id: r.engine_id || null,
          field_key: r.key,
          field_label: r.label,
          value: r.value,
          unit: r.unit
        })));
      if (readErr) throw readErr;
    }

    // 6. NEW LOGIC: Batch insert multiple watches/shifts attached to this single log sheet
    const finalWatches = Array.isArray(watches) ? watches : [];
    if (finalWatches.length > 0) {
      const { error: watchErr } = await supabase
        .from('log_watches')
        .insert(finalWatches.map(w => ({
          log_id: log.id,
          company_id: req.user.company_id,
          watch_period: w.watch_period,
          engineer_name: w.engineer_name || engineer_name,
          engine_hours_start: w.engine_hours_start || null,
          engine_hours_end: w.engine_hours_end || null
        })));
      if (watchErr) throw watchErr;
    }

    res.status(201).json({
      message: 'Log sheet and watch entries submitted successfully',
      log_id: log.id,
      flag_count: finalFlags,
      completion_pct: finalCompletion
    });

  } catch (err) {
    console.error('Submission pipeline failure:', err.message);
    res.status(500).json({ error: 'Failed to submit engine log sheet structure', detail: err.message });
  }
});

// ── PUT /api/logs/:id ────────────────────────────────────────
// Step 2.3 Refactor: Configurable/Extended log editing window
router.put("/:id", async (req, res) => {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("logs")
      .select("id, submitted_at, submitted_by, company_id")
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id)
      .single();

    if (fetchErr || !existing)
      return res.status(404).json({ error: "Log not found" });

    // Authorization Guard
    if (req.user.role === "crew" && existing.submitted_by !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Step 2.3 Fixed parameters: Standardizing window to a reliable 120 minutes (2 hours) for field ops flexibility
    const ageMinutes =
      (Date.now() - new Date(existing.submitted_at).getTime()) / 60000;
    if (ageMinutes > 120) {
      return res
        .status(403)
        .json({
          error:
            "Log sheet edit window has closed (120 minute threshold exceeded)",
        });
    }

    const {
      watch,
      engineer_name,
      engine_hours,
      fuel_level,
      notes,
      flag_count,
      completion_pct,
      check_items,
    } = req.body;

    const allItems = [];
    let computedFlags = 0,
      computedDone = 0,
      computedTotal = 0;

    if (check_items && Array.isArray(check_items)) {
      check_items.forEach((item) => {
        computedTotal++;
        const status = item.checked
          ? item.flag && item.flag !== "ok"
            ? "flag"
            : "ok"
          : "na";
        if (status === "ok") computedDone++;
        if (status === "flag") computedFlags++;
        const section = item.item_key
          .replace(/^checks-/, "")
          .replace(/_\d+$/, "");
        allItems.push({
          log_id: existing.id,
          company_id: req.user.company_id,
          section,
          item_label: item.item_key,
          status,
          is_custom: false,
        });
      });
    }

    const finalCompletion =
      computedTotal > 0
        ? Math.round((computedDone / computedTotal) * 100)
        : completion_pct || 0;
    const finalFlags = computedTotal > 0 ? computedFlags : flag_count || 0;

    const { error: updateErr } = await supabase
      .from("logs")
      .update({
        watch,
        engineer_name,
        engine_hours,
        fuel_level,
        notes,
        flag_count: finalFlags,
        completion_pct: finalCompletion,
      })
      .eq("id", existing.id);

    if (updateErr) throw updateErr;

    // Clean and replace child check rows
    if (allItems.length > 0) {
      await supabase.from("log_check_items").delete().eq("log_id", existing.id);
      const { error: itemErr } = await supabase
        .from("log_check_items")
        .insert(allItems);
      if (itemErr) throw itemErr;
    }

    res.json({
      message: "Log sheet updated successfully",
      flag_count: finalFlags,
      completion_pct: finalCompletion,
    });
  } catch (err) {
    console.error("Update log error:", err.message);
    res
      .status(500)
      .json({
        error: "Failed to update engine log sheet",
        detail: err.message,
      });
  }
});

module.exports = router;
