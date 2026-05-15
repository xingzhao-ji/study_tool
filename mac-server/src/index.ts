import { MockTutorProvider } from "./providers/MockTutorProvider.js";
import { createApp } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const provider = new MockTutorProvider();
const app = createApp(provider);

app.listen(port, host, () => {
  console.log(`goodnotes-companion-tutor listening on http://${host}:${port}`);
});
