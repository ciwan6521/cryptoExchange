"""
Email service — sends transactional emails via SendGrid (primary) or SMTP (fallback).
Falls back to logging if neither is configured.
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.config import settings

logger = logging.getLogger("crypto4pro.email")

BASE_URL = getattr(settings, "BASE_URL", "https://crypto4pro.io")


def _send_via_sendgrid(to: str, subject: str, html_body: str) -> bool:
    api_key = getattr(settings, "SENDGRID_API_KEY", "")
    from_email = getattr(settings, "SENDGRID_FROM_EMAIL", "") or getattr(settings, "SMTP_FROM_EMAIL", "noreply@crypto4pro.io")
    if not api_key:
        return False

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, Email, To, Content

        message = Mail(
            from_email=Email(from_email, "Crypto4Pro"),
            to_emails=To(to),
            subject=subject,
            html_content=Content("text/html", html_body),
        )
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        logger.info("SendGrid email sent to %s (status %d): %s", to, response.status_code, subject)
        return 200 <= response.status_code < 300
    except Exception:
        logger.exception("SendGrid failed for %s", to)
        return False


def _get_smtp_config() -> Optional[dict]:
    host = getattr(settings, "SMTP_HOST", "")
    port = getattr(settings, "SMTP_PORT", 587)
    user = getattr(settings, "SMTP_USER", "")
    password = getattr(settings, "SMTP_PASSWORD", "")
    from_email = getattr(settings, "SMTP_FROM_EMAIL", "noreply@crypto4pro.io")
    from_name = getattr(settings, "SMTP_FROM_NAME", "Crypto4Pro")
    if not host or not user:
        return None
    return {
        "host": host,
        "port": int(port),
        "user": user,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
    }


def _send_via_smtp(to: str, subject: str, html_body: str) -> bool:
    cfg = _get_smtp_config()
    if not cfg:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_email"], [to], msg.as_string())

        logger.info("SMTP email sent to %s: %s", to, subject)
        return True
    except Exception:
        logger.exception("SMTP failed for %s", to)
        return False


def send_email(to: str, subject: str, html_body: str) -> bool:
    if _send_via_sendgrid(to, subject, html_body):
        return True

    if _send_via_smtp(to, subject, html_body):
        return True

    logger.warning("No email provider configured — logging instead: to=%s subject=%s", to, subject)
    logger.info("Email body:\n%s", html_body[:500])
    return True


# ── HTML wrapper ──

def _wrap_html(content: str) -> str:
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0b0c; color: #e5e7eb; padding: 40px 30px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #a78bfa; margin: 0; font-size: 24px;">Crypto4Pro</h1>
        </div>
        {content}
        <hr style="border: none; border-top: 1px solid #1f2937; margin: 30px 0;" />
        <p style="color: #4b5563; font-size: 12px; text-align: center;">&copy; Crypto4Pro. All rights reserved.</p>
    </div>
    """


# ── Template helpers ──

def send_verification_code(to: str, code: str) -> bool:
    html = _wrap_html(f"""
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">Verify Your Email</h2>
        <p style="color: #9ca3af; line-height: 1.6; margin-bottom: 24px;">
            Welcome to Crypto4Pro! Use the verification code below to confirm your email address.
        </p>
        <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: #111317; border: 2px solid #7c3aed; border-radius: 12px; padding: 20px 40px; letter-spacing: 12px; font-size: 36px; font-weight: 700; color: #ffffff;">
                {code}
            </div>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
            This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.
        </p>
    """)
    return send_email(to, f"Your verification code: {code} — Crypto4Pro", html)


def send_email_verification(to: str, token: str) -> bool:
    verify_url = f"{BASE_URL}/auth/verify-email?token={token}"
    html = _wrap_html(f"""
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">Verify Your Email</h2>
        <p style="color: #9ca3af; line-height: 1.6; margin-bottom: 24px;">
            Welcome to Crypto4Pro! Please verify your email address to activate all features of your account.
        </p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{verify_url}" style="background: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block;">
                Verify Email
            </a>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">This link expires in 24 hours.</p>
    """)
    return send_email(to, "Verify Your Email — Crypto4Pro", html)


def send_password_reset_email(to: str, token: str) -> bool:
    reset_url = f"{BASE_URL}/auth/reset-password?token={token}"
    html = _wrap_html(f"""
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">Reset Your Password</h2>
        <p style="color: #9ca3af; line-height: 1.6; margin-bottom: 24px;">
            We received a request to reset the password for your account. Click the button below to set a new password.
        </p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_url}" style="background: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; display: inline-block;">
                Reset Password
            </a>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
    """)
    return send_email(to, "Reset Your Password — Crypto4Pro", html)


def send_login_alert(to: str, ip: str, user_agent: str) -> bool:
    html = _wrap_html(f"""
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">New Login Detected</h2>
        <p style="color: #9ca3af; line-height: 1.6; margin-bottom: 16px;">
            A new login was detected on your account:
        </p>
        <div style="background: #111317; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #9ca3af; margin: 4px 0;"><strong style="color: #e5e7eb;">IP Address:</strong> {ip}</p>
            <p style="color: #9ca3af; margin: 4px 0;"><strong style="color: #e5e7eb;">Device:</strong> {user_agent[:100]}</p>
        </div>
        <p style="color: #6b7280; font-size: 13px;">
            If this wasn't you, please change your password immediately and enable 2FA.
        </p>
    """)
    return send_email(to, "New Login Alert — Crypto4Pro", html)


def send_withdrawal_confirmation(to: str, asset: str, amount: str, address: str) -> bool:
    html = _wrap_html(f"""
        <h2 style="color: #ffffff; font-size: 20px; margin-bottom: 16px;">Withdrawal Submitted</h2>
        <div style="background: #111317; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <p style="color: #9ca3af; margin: 4px 0;"><strong style="color: #e5e7eb;">Asset:</strong> {asset}</p>
            <p style="color: #9ca3af; margin: 4px 0;"><strong style="color: #e5e7eb;">Amount:</strong> {amount}</p>
            <p style="color: #9ca3af; margin: 4px 0; word-break: break-all;"><strong style="color: #e5e7eb;">To:</strong> {address}</p>
        </div>
        <p style="color: #ef4444; font-size: 13px; font-weight: 600;">
            If you did not request this withdrawal, contact support immediately.
        </p>
    """)
    return send_email(to, f"Withdrawal of {amount} {asset} — Crypto4Pro", html)
