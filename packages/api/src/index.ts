import express from 'express';

const app = express();
const PORT = process.env['API_PORT'] ?? 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'trippulse-api' });
});

app.listen(PORT, () => {
  console.log(`[api] Listening on port ${PORT}`);
});
