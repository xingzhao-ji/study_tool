import { createTutorProvider } from "./providers/ProviderFactory.js";
import { createApp } from "./server.js";
import { createPairingConfig } from "./security/Pairing.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const pairing = createPairingConfig({ host, envToken: process.env.PAIRING_TOKEN });
const provider = createTutorProvider({
  providerName: process.env.TUTOR_PROVIDER,
  codexTimeoutMs: process.env.CODEX_TIMEOUT_MS
});
const app = createApp(provider, undefined, { pairing });

app.listen(port, host, () => {
  console.log(`goodnotes-companion-tutor listening on http://${host}:${port}`);
  if (pairing.required) {
    console.log(`LAN pairing token: ${pairing.token}`);
  }
});
