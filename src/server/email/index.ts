// Email service boundary. "console" driver is a dev stub that prints the
// message to the server log — clearly not a production integration.
// Swap in an SMTP/Resend driver via EMAIL_DRIVER without touching callers.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n━━━ DEV EMAIL (EMAIL_DRIVER=console) ━━━\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
    );
  }
}

class NotConfiguredEmailProvider implements EmailProvider {
  async send(): Promise<void> {
    throw new Error(
      "Email is not configured. Set EMAIL_DRIVER=console for development or configure SMTP.",
    );
  }
}

export function getEmailProvider(): EmailProvider {
  const driver = process.env.EMAIL_DRIVER ?? "console";
  if (driver === "console") return new ConsoleEmailProvider();
  // SMTP driver lands here later; until then fail honestly rather than fake a send.
  return new NotConfiguredEmailProvider();
}
