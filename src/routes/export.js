const express = require('express');
const router = express.Router();
const { query, queryOne, dbErr } = require('../db');
const { requireAuth } = require('../middleware/auth');

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// GET /api/v1/runs/:runId/export?format=csv|pdf|html
router.get('/:runId/export', requireAuth, async (req, res) => {
  try {
    const run = await queryOne(`
      SELECT r.*, p.name AS project_name,
        COUNT(rc.id)::int AS total,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int AS na
      FROM runs r
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN run_cases rc ON rc.run_id = r.id
      WHERE r.id = $1 GROUP BY r.id, p.name
    `, [req.params.runId]);

    if (!run) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    if (run.status !== 'completed') return res.status(400).json({ error: 'Run is not completed', code: 'RUN_NOT_COMPLETED' });

    const { format = 'csv' } = req.query;
    const cases = await query(
      "SELECT * FROM run_cases WHERE run_id = $1 ORDER BY CASE status WHEN 'fail' THEN 0 ELSE 1 END, sort_order",
      [req.params.runId]
    );

    const safeName = run.name.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 50);
    const dateStr = new Date(run.completed_at || run.created_at).toISOString().slice(0, 10);

    if (format === 'csv') {
      const rows = [['ID', 'Case Title', 'Suite', 'Priority', 'Status', 'Note', 'Step Results']];
      for (const c of cases) {
        const stepResults = c.step_results ? JSON.parse(c.step_results).map(s => `Step ${s.stepIndex + 1}: ${s.status}${s.actualResult ? ' — ' + s.actualResult : ''}`).join('; ') : '';
        rows.push([c.case_number ? `TC-${c.case_number}` : '', c.title, c.suite_name, c.priority, c.status || '', c.note || '', stepResults]);
      }
      const csv = rows.map(row => row.map(escapeCSV).join(',')).join('\r\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="LTCM_${safeName}_${dateStr}.csv"`);
      return res.send(csv);
    }

    if (format === 'html' || format === 'pdf') {
      const statusColor = { pass: '#22c55e', fail: '#f43f5e', skip: '#71717a', blocked: '#f97316', na: '#94a3b8' };
      const caseRows = cases.map(c => {
        const stepResultsHtml = c.step_results ? (() => {
          const parsed = JSON.parse(c.step_results);
          return parsed.map(s => `<div style="font-size:11px;color:#6b7280">Step ${s.stepIndex + 1}: <strong>${s.status}</strong>${s.actualResult ? ' — ' + escHtml(s.actualResult) : ''}</div>`).join('');
        })() : '';
        return `
        <tr class="${c.status === 'fail' ? 'fail-row' : c.status === 'blocked' ? 'blocked-row' : ''}">
          <td class="center" style="color:#6b7280;font-size:11px;white-space:nowrap">${c.case_number ? `TC-${c.case_number}` : ''}</td>
          <td>${escHtml(c.title)}${stepResultsHtml ? '<div class="step-results">' + stepResultsHtml + '</div>' : ''}</td>
          <td>${escHtml(c.suite_name)}</td>
          <td class="center">${escHtml(c.priority)}</td>
          <td class="center"><span class="badge" style="background:${statusColor[c.status] || '#4b5563'}">${c.status || '—'}</span></td>
          <td>${escHtml(c.note || '')}</td>
        </tr>
      `;}).join('');

      const completedAt = run.completed_at ? new Date(run.completed_at) : null;
      const createdAt = run.created_at ? new Date(run.created_at) : null;
      const duration = completedAt && createdAt ? formatDuration(completedAt - createdAt) : '—';
      const completedStr = completedAt ? completedAt.toISOString().slice(0, 16).replace('T', ' ') : '—';

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Test Run Report — ${escHtml(run.name)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; color: #1a1a2e; background: #fff; padding: 40px; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
  .summary { display: flex; gap: 16px; margin-bottom: 28px; }
  .stat { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 20px; text-align: center; }
  .stat-num { font-size: 28px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .pass .stat-num { color: #16a34a; } .fail .stat-num { color: #dc2626; }
  .skip .stat-num { color: #6b7280; } .blocked .stat-num { color: #ea580c; } .na .stat-num { color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1a1a2e; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .fail-row td { background: #fff5f5; } .blocked-row td { background: #fff7ed; }
  .center { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .project-name { font-size: 12px; color: #6b7280; font-weight: 500; margin-bottom: 2px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print" style="background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:8px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
    <span style="font-size:13px">📄 Use <strong>File → Print</strong> (or Ctrl/Cmd+P) to save as PDF</span>
    <button onclick="window.print()" style="margin-left:auto;background:#6366f1;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600">Print / Save PDF</button>
  </div>
  <div class="project-name">${escHtml(run.project_name)}</div>
  <h1>${escHtml(run.name)}</h1>
  <div class="meta">Completed ${completedStr} · Duration: ${duration} · ${run.total} cases${run.environment ? ' · ' + escHtml(run.environment) : ''}</div>
  <div class="summary">
    <div class="stat pass"><div class="stat-num">${run.passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat fail"><div class="stat-num">${run.failed}</div><div class="stat-label">Failed</div></div>
    <div class="stat skip"><div class="stat-num">${run.skipped}</div><div class="stat-label">Skipped</div></div>
    ${run.blocked > 0 ? `<div class="stat blocked"><div class="stat-num">${run.blocked}</div><div class="stat-label">Blocked</div></div>` : ''}
    ${run.na > 0 ? `<div class="stat na"><div class="stat-num">${run.na}</div><div class="stat-label">N/A</div></div>` : ''}
  </div>
  <table>
    <thead><tr><th class="center">ID</th><th>Case</th><th>Suite</th><th class="center">Priority</th><th class="center">Result</th><th>Notes</th></tr></thead>
    <tbody>${caseRows}</tbody>
  </table>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      if (format === 'pdf') res.setHeader('Content-Disposition', `inline; filename="LTCM_${safeName}_${dateStr}.html"`);
      return res.send(html);
    }

    res.status(400).json({ error: 'Unsupported format. Use csv or pdf.', code: 'INVALID_FORMAT' });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

module.exports = router;
