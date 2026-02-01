import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCtKaONmU_RiTjjVvpN4XyJZAUY-ZgafIM",
    authDomain: "sharks-fantasy.firebaseapp.com",
    projectId: "sharks-fantasy",
    storageBucket: "sharks-fantasy.firebasestorage.app",
    messagingSenderId: "38574787028",
    appId: "1:38574787028:web:3bfe1adc814f31261f2e41",
    measurementId: "G-N8Q6MQ4TBC"
};

// TEAM STATS URL (Source of Truth)
const TARGET_URL = 'https://clupik.pro/es/team/15688441';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- POINT CALCULATION ---
const calcMatchPoints = (pos, s) => {
    if (!s) return 0;
    let pts = 0;
    pts += (s.partidos || 0) * 1;
    pts += (s.tarjetas || 0) * -5;
    pts += (s.expulsiones || 0) * -1;
    if (pos === 'Portero') {
        pts += (s.paradas || 0) * 2;
        pts += (s.goles_contra || 0) * -1;
        pts += (s.penaltis_parados || 0) * 3;
    } else {
        pts += (s.goles || 0) * 6;
        pts += (s.penaltis || 0) * 4;
        pts += (s.tiros || 0) * 2;
        pts += (s.penaltis_fallados || 0) * -3;
    }
    return pts;
};

// --- APP INIT ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- HELPERS ---
async function getMaxJornada() {
    const snapshot = await getDocs(collection(db, "jugadores"));
    let max = 0;
    snapshot.forEach(doc => {
        const d = doc.data();
        if (d.historial && Array.isArray(d.historial)) {
            d.historial.forEach(h => {
                if (h.jornada > max) max = h.jornada;
            });
        }
    });
    return max;
}

// Helper to sum stats from historial
function getDbTotals(historial) {
    const total = {
        partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0,
        tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0
    };
    if (!historial) return total;
    historial.forEach(h => {
        const s = h.stats || {};
        total.partidos += (s.partidos || 0);
        total.goles += (s.goles || 0);
        total.penaltis += (s.penaltis || 0);
        total.tarjetas += (s.tarjetas || 0);
        total.expulsiones += (s.expulsiones || 0);
        total.tiros += (s.tiros || 0);
        total.penaltis_fallados += (s.penaltis_fallados || 0);
        total.paradas += (s.paradas || 0);
        total.goles_contra += (s.goles_contra || 0);
        total.penaltis_parados += (s.penaltis_parados || 0);
    });
    return total;
}

// --- MAIN FUNCTION ---
async function syncTeamStats() {
    console.log(`\n[${new Date().toISOString()}] Starting Global Stats Sync...`);

    try {
        await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

        // 1. Fetch Web Stats
        console.log("Fetching Source of Truth:", TARGET_URL);
        const { data } = await axios.get(TARGET_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);

        // Map Headers to Indices
        const table = $('table').first();
        const headers = [];
        table.find('th').each((i, th) => headers.push($(th).text().trim()));

        const idx = {
            name: headers.indexOf('Nombre'),
            pj: headers.indexOf('PJ'),
            g: headers.indexOf('G'),
            gp: headers.indexOf('GP'),
            ta: headers.indexOf('TA'),
            tr: headers.indexOf('TR'),
            ex: headers.indexOf('EX'),
            pf: headers.indexOf('PF')
        };

        console.log("Column Mapping:", idx);

        const webPlayers = [];
        const parseStat = (txt) => (txt && txt !== '-') ? (parseInt(txt) || 0) : 0;

        table.find('tbody tr').each((i, row) => {
            const cols = $(row).find('td');
            if (cols.length > 0) {
                let rawName = $(cols[idx.name]).text().trim();
                // Clean "Ver" and extra whitespace/newlines
                // Example: "Ver\n\n   Name" -> "Name"
                let name = rawName.replace(/^Ver\s+/i, '').replace(/Ver$/i, '').trim();
                if (name.includes('\n')) {
                    name = name.split('\n').map(s => s.trim()).filter(s => s.length > 2).pop() || name;
                }

                if (name) {
                    const stats = {
                        partidos: parseStat($(cols[idx.pj]).text()),
                        goles: parseStat($(cols[idx.g]).text()),
                        penaltis: parseStat($(cols[idx.gp]).text()),
                        tarjetas: parseStat($(cols[idx.ta]).text()) + parseStat($(cols[idx.tr]).text()),
                        expulsiones: parseStat($(cols[idx.ex]).text()),
                        tiros: 0, // Not in table usually
                        penaltis_fallados: (idx.pf > -1) ? parseStat($(cols[idx.pf]).text()) : 0,
                        paradas: 0,
                        goles_contra: 0,
                        penaltis_parados: 0
                    };
                    webPlayers.push({ name, stats });
                }
            }
        });

        console.log(`Parsed ${webPlayers.length} players from Web.`);

        // 2. Compare with DB
        const currentMaxJornada = await getMaxJornada();
        const nextJornada = currentMaxJornada + 1;

        let updatesCount = 0;
        const snapshot = await getDocs(collection(db, "jugadores"));

        for (const docSnap of snapshot.docs) {
            const p = docSnap.data();
            const normalize = (str) => str.replace(/\s*\(c\)$/i, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const pName = normalize(p.name);
            const pNick = normalize(p.nick);

            const webP = webPlayers.find(wp => {
                const wpName = normalize(wp.name);
                return wpName === pName || (pNick && wpName === pNick);
            });

            if (webP) {
                const dbTotals = getDbTotals(p.historial);

                // Calculate Delta
                const delta = {
                    partidos: webP.stats.partidos - dbTotals.partidos,
                    goles: webP.stats.goles - dbTotals.goles,
                    penaltis: webP.stats.penaltis - dbTotals.penaltis,
                    tarjetas: webP.stats.tarjetas - dbTotals.tarjetas,
                    expulsiones: webP.stats.expulsiones - dbTotals.expulsiones,
                    // Tiros is likely not tracked well on team page, assume 0 delta for now or implement if column exists
                    tiros: 0, // webP.stats.tiros - dbTotals.tiros 
                    penaltis_fallados: webP.stats.penaltis_fallados - dbTotals.penaltis_fallados,
                    // Keep GK stats usually manual or separate? Assuming 0 for now unless special GK logic needed.
                    paradas: 0,
                    goles_contra: 0,
                    penaltis_parados: 0
                };

                // Check if meaningful change (ignore negatives? or allow corrections?)
                // User said "si hay diferencia, añade nueva jornada". 
                // We should only add if there is a POSITIVE change in at least one stat?
                // Actually, corrections might be needed.
                // But typically we are adding a NEW GAME.

                const hasChanges = Object.values(delta).some(v => v !== 0);

                if (hasChanges) {
                    console.log(`\nFound updates for ${p.name}:`);
                    console.log(`   Web vs DB: Goles ${webP.stats.goles}/${dbTotals.goles}, PJ ${webP.stats.partidos}/${dbTotals.partidos}`);
                    console.log(`   Delta:`, delta);

                    // Create New Jornada Entry
                    const roundPoints = calcMatchPoints(p.pos, delta);
                    const newEntry = {
                        jornada: nextJornada,
                        stats: delta,
                        puntos: roundPoints,
                        date: new Date().toISOString()
                    };

                    let newHistorial = [...(p.historial || []), newEntry];

                    // Update DB with NEW TOTALS (Source of Truth) to avoid drift
                    // We set root stats to webP.stats directly.
                    // But we push the delta to history.

                    await updateDoc(doc(db, "jugadores", docSnap.id), {
                        historial: newHistorial,
                        stats: webP.stats
                    });
                    updatesCount++;
                }
            }
        }

        if (updatesCount > 0) {
            console.log(`\n✅ Created J${nextJornada} for ${updatesCount} players.`);

            // Recalc Rankings
            console.log("🔄 Recalculating User Rankings...");
            const playersSnapshot = await getDocs(collection(db, "jugadores"));
            const allPlayers = playersSnapshot.docs.map(d => d.data());
            const usersSnapshot = await getDocs(collection(db, "usuarios"));

            const getPlayerTotalPoints = (p) => {
                if (p.historial && Array.isArray(p.historial)) {
                    return p.historial.reduce((sum, entry) => sum + (entry.puntos || 0), 0);
                }
                return 0;
            };

            let uUpdates = 0;
            for (const userDoc of usersSnapshot.docs) {
                const u = userDoc.data();
                if (u.equipo && Array.isArray(u.equipo)) {
                    let teamPoints = 0;
                    u.equipo.forEach(pId => {
                        const player = allPlayers.find(p => p.id === pId);
                        if (player) teamPoints += getPlayerTotalPoints(player);
                    });
                    if (u.puntos !== teamPoints) {
                        await updateDoc(doc(db, "usuarios", userDoc.id), { puntos: teamPoints });
                        uUpdates++;
                    }
                }
            }
            console.log(`✅ Ranked Updated for ${uUpdates} users.`);

        } else {
            console.log("\n✅ No new stats found. Database is up to date.");
        }

    } catch (e) {
        console.error("Sync Error:", e);
    }
}

// --- EXECUTION CONTROL ---
const isMainModule = process.argv[1] && process.argv[1].endsWith('index.js');

if (isMainModule) {
    syncTeamStats();
}

export { syncTeamStats };
