
import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyCtKaONmU_RiTjjVvpN4XyJZAUY-ZgafIM",
    authDomain: "sharks-fantasy.firebaseapp.com",
    projectId: "sharks-fantasy",
    storageBucket: "sharks-fantasy.firebasestorage.app",
    messagingSenderId: "38574787028",
    appId: "1:38574787028:web:3bfe1adc814f31261f2e41",
    measurementId: "G-N8Q6MQ4TBC"
};

const PHASE_ID = '3652217';
const JORNADA_IDS = [
    '19460842', '19460843', '19460844', '19460845', '19460846',
    '19460847', '19460848', '19460849', '19460850', '19460851',
    '19460852', '19460853', '19460854', '19460855', '19460856',
    '19460857', '19460858', '19460859'
];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function normalize(str) {
    if (!str) return "";
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const calcMatchPoints = (pos, s) => {
    if (!s) return 0;
    let pts = 0;
    pts += 1; // Played
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

async function rebuildHistory() {
    console.log("🚀 Starting History Rebuild...");
    try {
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const auth = getAuth(app);

        if (ADMIN_EMAIL && ADMIN_PASSWORD) {
            await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log("Signed in.");
        }

        console.log("Fetching DB Players...");
        const pSnap = await getDocs(collection(db, "jugadores"));
        let dbPlayers = [];
        pSnap.forEach(d => dbPlayers.push({ id: d.id, ...d.data() }));
        console.log(`Loaded ${dbPlayers.length} players.`);

        console.log("Scanning Calendar for Played Matches...");
        let matches = [];

        for (let i = 0; i < JORNADA_IDS.length; i++) {
            const jId = JORNADA_IDS[i];
            const jNum = i + 1;
            const calUrl = `https://clupik.pro/es/tournament/1324114/calendar/${PHASE_ID}/${jId}`;
            console.log(`Checking J${jNum}...`);

            try {
                const { data: cData } = await axios.get(calUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const $c = cheerio.load(cData);

                let matchLink = null;
                let matchDate = null;

                // Find Sharks Match in Calendar
                const rows = $c('table tbody tr');
                rows.each((k, row) => {
                    const text = $c(row).text();
                    if (text.includes('Sharks')) {
                        matchLink = $c(row).find('a[href*="/match/"]').attr('href');
                        const dateTxt = $c(row).find('td').eq(2).text().trim();
                        if (dateTxt.length > 5) matchDate = dateTxt;
                    }
                });

                if (matchLink) {
                    const { data: mData } = await axios.get(matchLink, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const $m = cheerio.load(mData);

                    let targetTable = null;
                    let maxMatches = 0;

                    // Identify Sharks Stats Table
                    $m('table').each((t, tbl) => {
                        let matchesCount = 0;
                        const rows = $m(tbl).find('tbody tr');
                        rows.each((r, row) => {
                            const rowText = normalize($m(row).text()); // Check FULL text
                            // Check if any DB player name is in this row
                            if (dbPlayers.some(p => {
                                const n = normalize(p.name);
                                const nick = normalize(p.nick);
                                return rowText.includes(n) || (nick && rowText.includes(nick));
                            })) {
                                matchesCount++;
                            }
                        });

                        // console.log(`Table ${t} matched ${matchesCount} players.`);
                        if (matchesCount > maxMatches) {
                            maxMatches = matchesCount;
                            targetTable = tbl;
                        }
                    });

                    // Threshold: at least 3 players matched
                    if (targetTable && maxMatches >= 3) {
                        console.log(`✅ MATCH CONFIRMED [J${jNum}]: ${matchDate}`);

                        let dateObj = new Date(0);
                        if (matchDate) {
                            const dateMatch = matchDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                            if (dateMatch) {
                                dateObj = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]));
                                const timeMatch = matchDate.match(/(\d{2}):(\d{2})/);
                                if (timeMatch) {
                                    dateObj.setHours(parseInt(timeMatch[1]));
                                    dateObj.setMinutes(parseInt(timeMatch[2]));
                                }
                            }
                        }

                        const headers = [];
                        $m(targetTable).find('th').each((h, th) => headers.push($m(th).text().trim()));

                        // Determine indices
                        const idx = {
                            name: headers.indexOf('Nombre'),
                            g: headers.indexOf('G'),
                            pen: headers.indexOf('GP'),
                            ex: headers.indexOf('EX'),
                            pf: headers.indexOf('PF')
                        };

                        const matchStats = {};

                        $m(targetTable).find('tbody tr').each((r, row) => {
                            const cols = $m(row).find('td');

                            // Name is likely at idx.name OR 1 if idx.name not found
                            let nameIdx = idx.name;
                            if (nameIdx === -1) {
                                // Fallback: usually column 1
                                nameIdx = 1;
                            }

                            if (cols.length > nameIdx) {
                                const name = $m(cols[nameIdx]).text().trim();
                                const parse = (i) => i > -1 ? (parseInt($m(cols[i]).text()) || 0) : 0;

                                if (name && name !== 'TOTAL') {
                                    matchStats[normalize(name)] = {
                                        partidos: 1,
                                        goles: parse(idx.g),
                                        penaltis: parse(idx.pen),
                                        expulsiones: parse(idx.ex),
                                        penaltis_fallados: parse(idx.pf),
                                        tarjetas: 0,
                                        tiros: 0,
                                        paradas: 0,
                                        goles_contra: 0,
                                        penaltis_parados: 0
                                    };
                                }
                            }
                        });

                        matches.push({
                            originalJornada: jNum,
                            date: dateObj,
                            stats: matchStats
                        });

                    } else {
                        // console.log(`[J${jNum}] No team table found.`);
                    }
                }
            } catch (e) {
                console.error(`Error processing J${jNum}: ${e.message}`);
            }
        }

        // 3. Sort Matches Chronologically
        matches.sort((a, b) => a.date - b.date);
        console.log(`\nFound ${matches.length} valid played matches to process.`);
        matches.forEach((m, i) => console.log(` [Mapped J${i + 1}] Date: ${m.date.toDateString()} (Orig: J${m.originalJornada})`));

        // 4. Update Database
        console.log("\nUpdating Database...");

        for (const p of dbPlayers) {
            const pNorm = normalize(p.name);
            const pNick = normalize(p.nick);

            let newHistorial = [];
            let totalStats = {
                partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0,
                tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0
            };

            matches.forEach((m, index) => {
                const jornadaNum = index + 1;
                let s = null;
                // Find Match Stats
                const matchPlayerName = Object.keys(m.stats).find(key =>
                    key === pNorm || key.includes(pNorm) || (pNick && key === pNick) || pNorm.includes(key)
                );

                if (matchPlayerName) {
                    s = m.stats[matchPlayerName];
                }

                if (s) {
                    Object.keys(totalStats).forEach(k => totalStats[k] += (s[k] || 0));
                    newHistorial.push({
                        jornada: jornadaNum,
                        puntos: calcMatchPoints(p.pos, s),
                        stats: s,
                        date: m.date.toISOString(),
                        originalJornada: m.originalJornada
                    });
                }
            });

            // Always update to ensure sync
            await updateDoc(doc(db, "jugadores", p.id.toString()), {
                historial: newHistorial,
                stats: totalStats
            });
        }

        console.log("✅ Players Updated.");

        // 5. Recalculate User Rankings
        console.log("Recalculating Rankings...");
        const usersSnap = await getDocs(collection(db, "usuarios"));
        const freshPlayersSnap = await getDocs(collection(db, "jugadores"));
        const freshPlayers = freshPlayersSnap.docs.map(d => d.data());

        for (const uDoc of usersSnap.docs) {
            const u = uDoc.data();
            let pts = 0;
            if (u.equipo && Array.isArray(u.equipo)) {
                u.equipo.forEach(pid => {
                    const fp = freshPlayers.find(x => x.id === pid);
                    if (fp && fp.historial) {
                        pts += fp.historial.reduce((a, b) => a + b.puntos, 0);
                    }
                });
            }
            if (u.puntos !== pts) {
                await updateDoc(doc(db, "usuarios", uDoc.id), { puntos: pts });
            }
        }

        console.log("✅ History Rebuild Complete!");

    } catch (err) {
        console.error("FATAL ERROR:", err);
    }
}

rebuildHistory();
