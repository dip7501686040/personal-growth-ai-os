/**
 * One-time Gmail authorization for outreach drafts.
 *
 *   pnpm gmail-auth
 *
 * Prereq: a Google Cloud "Desktop app" OAuth client JSON saved at
 * ~/.config/pgai/gmail-credentials.json. This runs the consent flow on a
 * loopback port and writes ~/.config/pgai/gmail-token.json. Scope: gmail.compose
 * (+ openid/email just to show which account was linked).
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  GMAIL_SCOPES,
  linkedEmail,
  oauthClient,
  openInBrowser,
  saveToken,
} from "@/lib/outreach/gmail";

/** A single loopback listener does both the consent callback and the exchange. */
async function run(): Promise<void> {
  // Validate the client-secret JSON before binding a socket — throws with the
  // "create a Desktop OAuth client" instructions if it's missing.
  oauthClient("http://127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      try {
        if (err) throw new Error(err);
        if (!code) {
          res.writeHead(404).end("waiting for the OAuth callback…");
          return;
        }
        const port = (server.address() as AddressInfo).port;
        const client = oauthClient(`http://127.0.0.1:${port}`);
        const { tokens } = await client.getToken(code);
        saveToken(tokens);
        client.setCredentials(tokens);
        const email = await linkedEmail(client);
        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end(
            `<html><body style="font:16px system-ui;padding:2rem">Authorized ${email}. You can close this tab.</body></html>`,
          );
        server.close();
        console.log(
          `\n✓ Authorized ${email}. Token saved to ~/.config/pgai/gmail-token.json\n` +
            "  Next: pnpm outreach email <folder> --kind apply|cold",
        );
        resolve();
      } catch (e) {
        res.writeHead(500).end(String(e));
        server.close();
        reject(e);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const client = oauthClient(`http://127.0.0.1:${port}`);
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GMAIL_SCOPES,
      });
      console.log(`\nAuthorize in the browser (opening it now):\n\n${authUrl}\n`);
      openInBrowser(authUrl);
    });
  });
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
