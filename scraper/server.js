
import express from 'express';
import cors from 'cors';
import { syncTeamStats } from './index.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/scrape', async (req, res) => {
    console.log(`\n[API] Received Scrape Request from ${req.ip}`);
    try {
        await syncTeamStats();
        res.json({ success: true, message: "Scraping Completed. Check logs for details." });
    } catch (error) {
        console.error("Scrape API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Scraper API Server running on http://localhost:${PORT}`);
    console.log(`   Endpoint: POST /api/scrape`);
});
