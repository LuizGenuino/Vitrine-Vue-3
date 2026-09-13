/**
 * Interface comum para todos os providers de e-mail.
 * Facilita troca entre Resend, SendGrid, Postmark, SES, etc.
 */
export interface EmailProvider {
    send(input: EmailInput): Promise<EmailResult>
}

export interface EmailInput {
    to: string
    subject: string
    html: string
    text: string
    replyTo?: string
    tags?: Array<{ name: string; value: string }>
}

export interface EmailResult {
    id: string
    provider: string
}
