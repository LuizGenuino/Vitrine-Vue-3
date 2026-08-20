
interface BuildEmailInput {
    inviteUrl: string
    storeName: string
    storeLogoUrl: string | null
    inviterName: string
    inviterAvatar: string | null
    role: string
    message: string | null
    expiresAt: string
    recipientEmail: string
}

interface BuildEmailOutput {
    subject: string
    html: string
    text: string
}

const ROLE_LABELS: Record<string, string> = {
    OWNER: 'Proprietário',
    ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    SELLER: 'Vendedor',
    EDITOR: 'Editor',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
    OWNER: 'Controle total da loja, incluindo assinatura e configurações',
    ADMIN: 'Gerencia equipe, integrações e todas as áreas operacionais',
    MANAGER: 'Gerencia produtos, pedidos, cupons, clientes e analytics',
    SELLER: 'Atende pedidos, cadastra clientes e aplica cupons no dia a dia',
    EDITOR: 'Cadastra e edita produtos e categorias do catálogo',
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'long', year: 'numeric',
    })
}

function daysUntil(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

/* -------------------------------------------------------------------------- */
/*  Template HTML                                                             */
/*  Inline CSS + tabelas para compatibilidade com Gmail/Outlook/Apple Mail    */
/* -------------------------------------------------------------------------- */

export function buildInviteEmail(input: BuildEmailInput): BuildEmailOutput {
    const roleLabel = ROLE_LABELS[input.role] ?? input.role
    const roleDesc = ROLE_DESCRIPTIONS[input.role] ?? ''
    const expiresIn = daysUntil(input.expiresAt)
    const safeStore = escapeHtml(input.storeName)
    const safeInviter = escapeHtml(input.inviterName)
    const safeMessage = input.message ? escapeHtml(input.message) : null

    const subject = `${input.inviterName} convidou você para a equipe da ${input.storeName}`

    /* ---------------- HTML ---------------- */
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; padding: 16px !important; }
    .card { padding: 24px !important; }
    .btn { width: 100% !important; }
    h1 { font-size: 24px !important; }
  }
  @media (prefers-color-scheme: dark) {
    body { background-color: #0f172a !important; }
    .card { background-color: #1e293b !important; color: #e2e8f0 !important; }
    .muted { color: #94a3b8 !important; }
    .divider { border-color: #334155 !important; }
    .role-box { background-color: #312e81 !important; }
    .message-box { background-color: #1e3a8a !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1e293b;line-height:1.6;">

<!-- Preview text (invisível, aparece na inbox) -->
<div style="display:none;max-height:0;overflow:hidden;">
  ${safeInviter} convidou você para colaborar como ${roleLabel} na ${safeStore}. Aceite em até ${expiresIn} dias.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;padding:40px 20px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="container" style="max-width:600px;">

        <!-- Logo VibeStore -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <div style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-0.02em;">
              VibeStore
            </div>
          </td>
        </tr>

        <!-- Card principal -->
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="card" style="background-color:#ffffff;border-radius:16px;padding:40px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">

              <!-- Header com logo da loja -->
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  ${input.storeLogoUrl ? `
                    <img src="${escapeHtml(input.storeLogoUrl)}"
                         alt="${safeStore}"
                         width="72" height="72"
                         style="border-radius:12px;display:block;object-fit:cover;">
                  ` : `
                    <div style="width:72px;height:72px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:inline-block;line-height:72px;color:#fff;font-size:28px;font-weight:800;">
                      ${safeStore.charAt(0).toUpperCase()}
                    </div>
                  `}
                </td>
              </tr>

              <!-- Título -->
              <tr>
                <td align="center" style="padding-bottom:8px;">
                  <p class="muted" style="margin:0;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
                    Você foi convidado para
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-bottom:24px;">
                  <h1 style="margin:0;font-size:28px;font-weight:800;color:#1e293b;line-height:1.2;">
                    ${safeStore}
                  </h1>
                </td>
              </tr>

              <!-- Quem convidou -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:10px;padding:16px;">
                    <tr>
                      <td width="48" valign="middle">
                        ${input.inviterAvatar ? `
                          <img src="${escapeHtml(input.inviterAvatar)}"
                               width="40" height="40"
                               style="border-radius:50%;display:block;">
                        ` : `
                          <div style="width:40px;height:40px;background-color:#6366f1;border-radius:50%;color:#fff;text-align:center;line-height:40px;font-weight:700;">
                            ${safeInviter.charAt(0).toUpperCase()}
                          </div>
                        `}
                      </td>
                      <td valign="middle" style="padding-left:12px;">
                        <p class="muted" style="margin:0;font-size:12px;color:#64748b;">
                          Convidado por
                        </p>
                        <p style="margin:2px 0 0 0;font-size:15px;font-weight:700;color:#1e293b;">
                          ${safeInviter}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Role -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="role-box" style="background-color:#eef2ff;border-radius:10px;padding:16px;">
                    <tr>
                      <td>
                        <p class="muted" style="margin:0 0 4px 0;font-size:12px;color:#4f46e5;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">
                          Sua função na loja
                        </p>
                        <p style="margin:0;font-size:18px;font-weight:800;color:#312e81;">
                          ${escapeHtml(roleLabel)}
                        </p>
                        <p style="margin:6px 0 0 0;font-size:14px;color:#4c1d95;line-height:1.5;">
                          ${escapeHtml(roleDesc)}
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${safeMessage ? `
              <!-- Mensagem pessoal -->
              <tr>
                <td style="padding-bottom:24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" class="message-box" style="background-color:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;padding:16px;">
                    <tr>
                      <td>
                        <p style="margin:0 0 8px 0;font-size:12px;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
                          Mensagem de ${safeInviter}
                        </p>
                        <p style="margin:0;font-size:15px;color:#0c4a6e;line-height:1.6;font-style:italic;">
                          "${safeMessage}"
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              ` : ''}

              <!-- CTA principal -->
              <tr>
                <td align="center" style="padding:8px 0 24px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="border-radius:100px;background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                        <a href="${escapeHtml(input.inviteUrl)}"
                           class="btn"
                           style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">
                          Aceitar convite →
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p class="muted" style="margin:16px 0 0 0;font-size:13px;color:#64748b;">
                    Ou copie e cole este link no navegador:
                  </p>
                  <p style="margin:8px 0 0 0;">
                    <a href="${escapeHtml(input.inviteUrl)}"
                       style="color:#6366f1;font-size:13px;word-break:break-all;text-decoration:underline;">
                      ${escapeHtml(input.inviteUrl)}
                    </a>
                  </p>
                </td>
              </tr>

              <!-- Divisor -->
              <tr>
                <td>
                  <hr class="divider" style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
                </td>
              </tr>

              <!-- Info do prazo -->
              <tr>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td width="24" valign="top">
                        <span style="font-size:18px;">⏱️</span>
                      </td>
                      <td valign="top" style="padding-left:8px;">
                        <p style="margin:0;font-size:14px;color:#1e293b;font-weight:600;">
                          Este convite expira em ${expiresIn} ${expiresIn === 1 ? 'dia' : 'dias'}
                        </p>
                        <p class="muted" style="margin:2px 0 0 0;font-size:13px;color:#64748b;">
                          Válido até ${fmtDate(input.expiresAt)}
                        </p>
                      </td>
                    </tr>
                    <tr><td colspan="2" style="height:12px;"></td></tr>
                    <tr>
                      <td width="24" valign="top">
                        <span style="font-size:18px;">📧</span>
                      </td>
                      <td valign="top" style="padding-left:8px;">
                        <p style="margin:0;font-size:14px;color:#1e293b;font-weight:600;">
                          Enviado para ${escapeHtml(input.recipientEmail)}
                        </p>
                        <p class="muted" style="margin:2px 0 0 0;font-size:13px;color:#64748b;">
                          Você precisará criar uma conta ou logar com este e-mail.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:32px;">
            <p class="muted" style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              Se você não esperava este convite, pode ignorar este e-mail com segurança.<br>
              O convite expira automaticamente e não fará nada sem sua ação.
            </p>
            <p class="muted" style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
              Enviado por <strong>VibeStore</strong> · A plataforma completa para sua loja online
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`

    /* ---------------- Versão texto plano (fallback e SPAM score) ---------------- */
    const text = `
${input.inviterName} convidou você para a equipe da ${input.storeName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sua função: ${roleLabel}
${roleDesc}

${input.message ? `\nMensagem de ${input.inviterName}:\n"${input.message}"\n` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para aceitar o convite, acesse:
${input.inviteUrl}

Este convite expira em ${expiresIn} ${expiresIn === 1 ? 'dia' : 'dias'} (${fmtDate(input.expiresAt)}).

Enviado para: ${input.recipientEmail}
Você precisará criar uma conta ou logar com este e-mail para aceitar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Se você não esperava este convite, pode ignorar este e-mail com segurança.

—
VibeStore · A plataforma completa para sua loja online
  `.trim()

    return { subject, html, text }
}
