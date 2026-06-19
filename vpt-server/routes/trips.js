const express = require("express");
const supabase = require("../lib/supabase");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);

// ── GET /api/trips/active/:vessel_id ─────────────────────────
router.get("/active/:vessel_id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("company_id", req.user.company_id)
      .eq("vessel_id", req.params.vessel_id)
      .in("status", ["predeparture", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ trip: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active trip" });
  }
});

// ── POST /api/trips ───────────────────────────────────────────
router.post("/", async (req, res) => {
  const { vessel_id, trip_number, fuel_start } = req.body;
  if (!vessel_id) return res.status(400).json({ error: "vessel_id required" });
  try {
    const { data: existing } = await supabase
      .from("trips")
      .select("id")
      .eq("company_id", req.user.company_id)
      .eq("vessel_id", vessel_id)
      .in("status", ["predeparture", "active"])
      .maybeSingle();
    if (existing)
      return res
        .status(400)
        .json({ error: "Vessel already has an active trip" });

    const { data: trip, error } = await supabase
      .from("trips")
      .insert({
        company_id: req.user.company_id,
        vessel_id,
        trip_number: trip_number || null,
        status: "predeparture",
        started_by: req.user.id,
        started_by_name: req.user.full_name,
        fuel_start: fuel_start || null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ trip });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to start trip", detail: err.message });
  }
});

// ── PUT /api/trips/:id ────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const { trip_number, fuel_start } = req.body;
  try {
    const { data, error } = await supabase
      .from("trips")
      .update({ trip_number, fuel_start })
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ trip: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to update trip" });
  }
});

// ── POST /api/trips/:id/predeparture ─────────────────────────
router.post("/:id/predeparture", async (req, res) => {
  const { check_items, notes } = req.body;
  try {
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, status, vessel_id")
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id)
      .single();
    if (tripErr || !trip)
      return res.status(404).json({ error: "Trip not found" });

    const { error: pdErr } = await supabase.from("trip_predeparture").insert({
      company_id: req.user.company_id,
      trip_id: trip.id,
      vessel_id: trip.vessel_id,
      submitted_by: req.user.id,
      submitted_by_name: req.user.full_name,
      check_items: check_items || [],
      notes: notes || null,
    });
    if (pdErr) throw pdErr;

    await supabase
      .from("trips")
      .update({ status: "active", departure_time: new Date().toISOString() })
      .eq("id", trip.id);

    res.json({ message: "Pre-departure submitted, trip is now active" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to submit pre-departure", detail: err.message });
  }
});

// ── POST /api/trips/:id/watch ─────────────────────────────────
router.post("/:id/watch", async (req, res) => {
  const {
    engineer_name,
    watch_start,
    watch_end,
    engine_readings,
    notes,
    flag_count,
  } = req.body;
  if (!engineer_name)
    return res.status(400).json({ error: "engineer_name required" });
  try {
    const { data: trip } = await supabase
      .from("trips")
      .select("id, vessel_id, status")
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id)
      .single();
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.status !== "active")
      return res.status(400).json({ error: "Trip is not active" });

    const { error } = await supabase.from("trip_watch_entries").insert({
      company_id: req.user.company_id,
      trip_id: trip.id,
      vessel_id: trip.vessel_id,
      engineer_name,
      watch_start: watch_start || null,
      watch_end: watch_end || null,
      engine_readings: engine_readings || [],
      notes: notes || null,
      flag_count: flag_count || 0,
    });
    if (error) throw error;
    res.json({ message: "Watch entry submitted" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to submit watch entry", detail: err.message });
  }
});

// ── PUT /api/trips/:id/close ──────────────────────────────────
router.put("/:id/close", async (req, res) => {
  const { fuel_end, total_engine_hours, notes } = req.body;
  try {
    const { error } = await supabase
      .from("trips")
      .update({
        status: "closed",
        closed_by: req.user.id,
        closed_by_name: req.user.full_name,
        arrival_time: new Date().toISOString(),
        fuel_end: fuel_end || null,
        total_engine_hours: total_engine_hours || null,
        notes: notes || null,
      })
      .eq("id", req.params.id)
      .eq("company_id", req.user.company_id);
    if (error) throw error;
    res.json({ message: "Trip closed" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to close trip", detail: err.message });
  }
});

// ── GET /api/trips/:id ────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const [tripRes, pdRes, watchRes, engRes] = await Promise.all([
      supabase
        .from("trips")
        .select("*, vessel:vessels(id,name)")
        .eq("id", req.params.id)
        .eq("company_id", req.user.company_id)
        .single(),
      supabase
        .from("trip_predeparture")
        .select("*")
        .eq("trip_id", req.params.id),
      supabase
        .from("trip_watch_entries")
        .select("*")
        .eq("trip_id", req.params.id)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("vessel_engines")
        .select("*")
        .eq("company_id", req.user.company_id),
    ]);
    if (tripRes.error) throw tripRes.error;
    const vesselEngines = engRes.data
      ? engRes.data.filter((e) => e.vessel_id === tripRes.data.vessel_id)
      : [];
    res.json({
      trip: tripRes.data,
      predeparture: pdRes.data ? pdRes.data[0] : null,
      watchEntries: watchRes.data || [],
      engines: vesselEngines,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch trip", detail: err.message });
  }
});

// ── GET /api/trips ────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { vessel_id, status } = req.query;
    let query = supabase
      .from("trips")
      .select("*, vessel:vessels(id,name)")
      .eq("company_id", req.user.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (vessel_id) query = query.eq("vessel_id", vessel_id);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ trips: data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch trips" });
  }
});

// ── PUT /api/trips/:id ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { trip_number, fuel_start } = req.body;
  try {
    const { data, error } = await supabase
      .from('trips')
      .update({ trip_number, fuel_start })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;
    res.json({ trip: data });
  } catch(err) {
    res.status(500).json({ error: 'Failed to update trip' });
  }
});
module.exports = router;
