import type { EmailProvider, EmailInput, EmailResult } from './types.ts'

interface ResendConfig {
    apiKey: string
    fromAddress: string
    fromName: string
}

interface ResendResponse {
    id: string
}

interface ResendError {
    statusCode: number
    message: string
    name?: string
}

export class ResendProvider implements EmailProvider {
    constructor(private config: ResendConfig) { }

    async send(input: EmailInput): Promise<EmailResult> {
        const payload = {
            from: `${this.config.fromName} <${this.config.fromAddress}>`,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
            reply_to: input.replyTo,
            tags: input.tags,
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        const data = await response.json()

        if (!response.ok) {
            const err = data as ResendError
            throw new Error(`[Resend ${err.statusCode}] ${err.message}`)
        }

        const success = data as ResendResponse
        return {
            id: success.id,
            provider: 'resend',
        }
    }
}
