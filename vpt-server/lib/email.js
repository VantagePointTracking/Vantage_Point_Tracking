const FROM_EMAIL = 'Vantage Point Tracking <onboarding@resend.dev>';

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
    });
    const data = await res.json();
    if (!res.ok) console.error('Resend error:', JSON.stringify(data));
    else console.log('Email sent:', data.id);
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

async function sendMaintenanceAlert({ managers, submitterName, vesselName, system, component, description, priority, orderId }) {
  const priorityColor = priority === 'high' ? '#C0392B' : priority === 'medium' ? '#E67E22' : '#27AE60';
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#1A1A1A;border-radius:12px;overflow:hidden">
      <div style="background:#242424;padding:24px;border-bottom:1px solid #333">
        <div style="font-size:18px;font-weight:700;color:#C9A84C;letter-spacing:1px">VANTAGE POINT TRACKING</div>
        <div style="font-size:12px;color:#6B7280;margin-top:4px">Fleet Intelligence Platform</div>
      </div>
      <div style="padding:24px">
        <div style="font-size:16px;font-weight:600;color:#F5F0E8;margin-bottom:16px">New Maintenance Order</div>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#6B7280;font-size:13px;width:140px">Vessel</td><td style="padding:8px 0;color:#F5F0E8;font-size:13px;font-weight:500">${vesselName}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Reported by</td><td style="padding:8px 0;color:#F5F0E8;font-size:13px">${submitterName}</td></tr>
          <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">System</td><td style="padding:8px 0;color:#F5F0E8;font-size:13px">${system}</td></tr>
          ${component ? `<tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Component</td><td style="padding:8px 0;color:#F5F0E8;font-size:13px">${component}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#6B7280;font-size:13px">Priority</td><td style="padding:8px 0;font-size:13px"><span style="background:${priorityColor}22;color:${priorityColor};padding:2px 10px;border-radius:6px;font-weight:600">${priorityLabel}</span></td></tr>
        </table>
        <div style="margin-top:16px;padding:12px;background:#2E2E2E;border-radius:8px;border-left:3px solid #C9A84C">
          <div style="font-size:12px;color:#6B7280;margin-bottom:6px">Description</div>
          <div style="font-size:14px;color:#F5F0E8">${description}</div>
        </div>
        <div style="margin-top:24px;padding:12px;background:#2E2E2E;border-radius:8px;font-size:12px;color:#6B7280">
          Log in to Vantage Point Tracking to review and approve or dismiss this order.
        </div>
      </div>
    </div>
  `;

  for (const manager of managers) {
    const toAddresses = manager.email === 'tannerwrightys@gmail.com'
      ? ['tannerwrightys@gmail.com']
      : [manager.email, 'tannerwrightys@gmail.com'].filter((v, i, a) => a.indexOf(v) === i);
    await sendEmail({ to: toAddresses, subject: `[VPT] Maintenance order — ${vesselName}: ${system}`, html });
  }
}

module.exports = { sendEmail, sendMaintenanceAlert };