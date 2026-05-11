"""Transactional email via Resend.

Emails sent:
  - welcome_email       : on first sign-in
  - quota_warning_email : when org reaches 80% of any monthly limit

Skipped silently when RESEND_API_KEY or EMAIL_FROM is not configured.
"""

from __future__ import annotations

import structlog

from app.config import settings

logger = structlog.get_logger()


def _is_configured() -> bool:
    return bool(settings.resend_api_key and settings.email_from)


def _resend():
    import resend as _r
    _r.api_key = settings.resend_api_key
    return _r


# ── Email templates ────────────────────────────────────────────────────────

def _welcome_html(dashboard_url: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }}
    .container {{ max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }}
    .header {{ background: #0f172a; padding: 32px; text-align: center; }}
    .header h1 {{ color: #ffffff; font-size: 24px; margin: 0; letter-spacing: -0.5px; }}
    .body {{ padding: 32px; }}
    .body p {{ color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }}
    .btn {{ display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0; }}
    .footer {{ padding: 24px 32px; border-top: 1px solid #e5e7eb; }}
    .footer p {{ color: #9ca3af; font-size: 13px; margin: 0; }}
    ul {{ color: #374151; font-size: 15px; line-height: 1.8; margin: 0 0 16px; padding-left: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Aethen</h1>
    </div>
    <div class="body">
      <p>Your account is ready. Aethen helps you diagnose why AI agents fail by reasoning across execution traces.</p>
      <p><strong>Get started in 3 steps:</strong></p>
      <ul>
        <li>Connect your Langfuse or LangSmith integration</li>
        <li>Pull your first traces into Aethen</li>
        <li>Run an analysis to see failure insights</li>
      </ul>
      <a href="{dashboard_url}" class="btn">Open Dashboard →</a>
    </div>
    <div class="footer">
      <p>You received this because you signed up for Aethen. Questions? Reply to this email.</p>
    </div>
  </div>
</body>
</html>
"""


def _quota_warning_html(
    resource_label: str,
    used: int,
    limit: int,
    pct: float,
    dashboard_url: str,
) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 0; }}
    .container {{ max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }}
    .header {{ background: #92400e; padding: 32px; text-align: center; }}
    .header h1 {{ color: #fef3c7; font-size: 22px; margin: 0; }}
    .body {{ padding: 32px; }}
    .body p {{ color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }}
    .stat {{ background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0; }}
    .stat p {{ margin: 0; font-size: 15px; color: #92400e; }}
    .btn {{ display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0; }}
    .footer p {{ color: #9ca3af; font-size: 13px; margin: 0; padding: 24px 32px; border-top: 1px solid #e5e7eb; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ You're approaching your monthly limit</h1>
    </div>
    <div class="body">
      <p>Your organisation has used <strong>{pct:.0f}%</strong> of its monthly <strong>{resource_label}</strong> quota.</p>
      <div class="stat">
        <p><strong>{used:,}</strong> of <strong>{limit:,}</strong> {resource_label} used this month.</p>
      </div>
      <p>Limits reset on the 1st of each month. Check your current usage in the dashboard.</p>
      <a href="{dashboard_url}/settings/usage" class="btn">View Usage →</a>
    </div>
    <div class="footer">
      <p>You received this because you're a member of an Aethen organisation.</p>
    </div>
  </div>
</body>
</html>
"""


# ── Public send functions ──────────────────────────────────────────────────

async def send_welcome_email(to_email: str, name: str | None = None) -> None:
    """Send a welcome email to a newly signed-up user."""
    if not _is_configured():
        logger.debug("email_skipped_no_config", reason="RESEND_API_KEY or EMAIL_FROM not set")
        return
    try:
        r = _resend()
        dashboard_url = settings.frontend_url
        subject = "Welcome to Aethen"
        r.Emails.send({
            "from": settings.email_from,
            "to": [to_email],
            "subject": subject,
            "html": _welcome_html(dashboard_url),
        })
        logger.info("email_sent", type="welcome", to=to_email)
    except Exception as exc:
        logger.warning("email_send_failed", type="welcome", to=to_email, error=str(exc))


async def send_daily_digest_email(
    to_email: str,
    org_name: str,
    date_label: str,
    stats: dict,
) -> bool:
    """Send a daily failure-intelligence digest email. Returns True if sent successfully."""
    if not _is_configured():
        logger.debug("email_skipped_no_config", reason="RESEND_API_KEY or EMAIL_FROM not set")
        return False
    try:
        r = _resend()
        total    = stats.get("total_sessions", 0)
        failures = stats.get("total_failures", 0)
        analyzed = stats.get("analyzed", 0)
        high_conf = stats.get("high_confidence_failures", 0)
        breakdown = stats.get("breakdown", {})
        top_agent = stats.get("top_agent", "")
        dashboard = settings.frontend_url

        bd_rows = "".join(
            f'<tr><td style="padding:6px 0;color:#374151;">{k.replace("_"," ").title()}</td>'
            f'<td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;">{v}</td></tr>'
            for k, v in breakdown.items() if v > 0
        )

        html = f"""
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{{font-family:-apple-system,sans-serif;background:#f9fafb;margin:0;padding:0}}
.c{{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}}
.h{{background:#0f172a;padding:28px 32px}}.h h1{{color:#fff;font-size:20px;margin:0;letter-spacing:-0.5px}}
.h p{{color:#94a3b8;font-size:13px;margin:8px 0 0}}.b{{padding:28px 32px}}
.stat{{display:inline-block;text-align:center;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;min-width:90px;margin:0 6px 6px 0}}
.stat .n{{font-size:28px;font-weight:800;color:#0f172a;display:block}}.stat .l{{font-size:11px;color:#64748b;margin-top:2px}}
.btn{{display:inline-block;background:#6366f1;color:#fff!important;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600}}
table{{width:100%;border-collapse:collapse}}td{{font-size:13px}}.f{{padding:20px 32px;border-top:1px solid #e5e7eb}}
.f p{{color:#9ca3af;font-size:12px;margin:0}}</style></head><body>
<div class="c"><div class="h">
  <h1>Daily Intelligence Report</h1>
  <p>{org_name} · {date_label}</p>
</div><div class="b">
  <p style="color:#374151;font-size:14px;margin:0 0 20px">Here's yesterday's AI agent failure summary.</p>
  <div style="margin-bottom:24px">
    <div class="stat"><span class="n">{total}</span><span class="l">Sessions</span></div>
    <div class="stat"><span class="n">{failures}</span><span class="l">Failures</span></div>
    <div class="stat"><span class="n">{analyzed}</span><span class="l">Analyzed</span></div>
    <div class="stat"><span class="n" style="color:#ef4444">{high_conf}</span><span class="l">High Severity</span></div>
  </div>
  {f'<table style="margin-bottom:20px"><tr><th style="text-align:left;font-size:12px;color:#6b7280;font-weight:600;padding-bottom:8px">Failure Type</th><th style="text-align:right;font-size:12px;color:#6b7280;font-weight:600;padding-bottom:8px">Count</th></tr>{bd_rows}</table>' if bd_rows else ''}
  {f'<p style="font-size:13px;color:#374151;margin:0 0 20px">Most affected agent: <strong>{top_agent}</strong></p>' if top_agent else ''}
  <a href="{dashboard}/traces" class="btn">View Sessions →</a>
</div><div class="f"><p>Daily digest from Aethen. Manage preferences in Settings → Digest Recipients.</p></div>
</div></body></html>"""

        r.Emails.send({
            "from": settings.email_from,
            "to": [to_email],
            "subject": f"Aethen Daily Report — {date_label} · {failures} failure{'s' if failures != 1 else ''}",
            "html": html,
        })
        logger.info("email_sent", type="daily_digest", to=to_email)
        return True
    except Exception as exc:
        logger.warning("email_send_failed", type="daily_digest", to=to_email, error=str(exc))
        return False


async def send_quota_warning_email(
    to_email: str,
    resource: str,
    used: int,
    limit: int,
    pct: float,
) -> None:
    """Send a quota warning when an org hits 80% of a monthly limit."""
    if not _is_configured():
        return
    try:
        r = _resend()
        label = "sessions ingested" if resource == "sessions" else "analysis runs"
        r.Emails.send({
            "from": settings.email_from,
            "to": [to_email],
            "subject": f"Aethen: You've used {pct:.0f}% of your {label} quota",
            "html": _quota_warning_html(label, used, limit, pct, settings.frontend_url),
        })
        logger.info("email_sent", type="quota_warning", to=to_email, resource=resource, pct=pct)
    except Exception as exc:
        logger.warning("email_send_failed", type="quota_warning", to=to_email, error=str(exc))
