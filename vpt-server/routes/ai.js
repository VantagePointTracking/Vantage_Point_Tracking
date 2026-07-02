
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);

// ── POST /api/ai/analyze ─────────────────────────────────────
// Proxy to either Anthropic or Google Gemini depending on key format.
// AIza... = Google Gemini (free tier)
// sk-ant- = Anthropic (paid)
// Falls back to server ANTHROPIC_API_KEY if no user key provided.
router.post('/analyze', async (req, res) => {
  const { userApiKey, model, max_tokens, messages } = req.body;
  // Prefer Anthropic (Claude) — higher usage limits than free Gemini tier.
  // Falls back to Gemini, then any user-provided key.
  const apiKey = process.env.ANTHROPIC_API_KEY || userApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'No API key set. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to Railway Variables.'
    });
  }

  try {
    // ── Google Gemini (free tier) ───────────────────────────
    if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.')) {
      // Convert Anthropic message format → Gemini format
      const parts = [];
      for (const msg of messages) {
        const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
        for (const block of content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image') {
            parts.push({ inline_data: { mime_type: block.source.media_type, data: block.source.data } });
          } else if (block.type === 'document') {
            parts.push({ inline_data: { mime_type: block.source.media_type, data: block.source.data } });
          }
        }
      }

      const geminiRes = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] })
        }
      );

      const geminiData = await geminiRes.json();

      if (!geminiRes.ok) {
        let msg = geminiData.error?.message || 'Gemini API error';
        if (geminiRes.status === 429) {
          msg = 'AI usage limit reached for now. The free Gemini tier resets daily — try again shortly, or ask Tanner to upgrade to a paid Gemini key for higher limits.';
        }
        return res.status(geminiRes.status).json({ error: msg });
      }

      // Convert Gemini response → Anthropic-compatible format for the frontend
      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return res.json({ content: [{ type: 'text', text }] });
    }

    // ── Anthropic (paid) ────────────────────────────────────
    if (!apiKey.startsWith('sk-ant-') && !apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'API key format not recognized. Use a Google Gemini key from aistudio.google.com or an Anthropic key.' });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: max_tokens || 1024, messages })
    });

    const anthropicData = await anthropicRes.json();
    if (anthropicRes.status === 401) {
      return res.status(401).json({ error: 'Invalid Anthropic API key.' });
    }
    if (anthropicRes.status === 429) {
      return res.status(429).json({ error: 'Anthropic usage limit reached. Check usage/billing at console.anthropic.com.' });
    }
    if (anthropicRes.status === 400) {
      console.error('Anthropic 400 error:', JSON.stringify(anthropicData));
      const msg = anthropicData.error?.message || 'Anthropic request rejected — check the model name and request format.';
      return res.status(400).json({ error: msg });
    }
    return res.status(anthropicRes.status).json(anthropicData);

  } catch (err) {
    console.error('AI proxy error:', err.message);
    res.status(500).json({ error: 'AI request failed', detail: err.message });
  }
});

// ── POST /api/ai/log-interaction ─────────────────────────────
router.post('/log-interaction', async (req, res) => {
  const { question, response, screen } = req.body;
  try {
    const supabase = require('../lib/supabase');
    await supabase.from('ai_interactions').insert({
      company_id: req.user.company_id,
      user_id: req.user.id,
      user_name: req.user.full_name,
      question: question || null,
      response: response || null,
      screen_context: screen || null,
      created_at: new Date().toISOString()
    });
  } catch(e) { /* non-critical — don't fail */ }
  res.json({ logged: true });
});

module.exports = router;
