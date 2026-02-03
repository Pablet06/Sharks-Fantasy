
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyCtKaONmU_RiTjjVvpN4XyJZAUY-ZgafIM",
    authDomain: "sharks-fantasy.firebaseapp.com",
    projectId: "sharks-fantasy",
    storageBucket: "sharks-fantasy.firebasestorage.app",
    messagingSenderId: "38574787028",
    appId: "1:38574787028:web:3bfe1adc814f31261f2e41",
    measurementId: "G-N8Q6MQ4TBC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function checkDb() {
    try {
        console.log("Logging in...");
        if (ADMIN_EMAIL && ADMIN_PASSWORD) {
            await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
            console.log("Logged in.");
        } else {
            console.log("No creds found in env, trying anonymous/public read...");
        }
        // Let's try reading public collection first.

        console.log("Reading players...");
        const snapshot = await getDocs(collection(db, "jugadores"));

        snapshot.forEach(doc => {
            const p = doc.data();
            if (p.name.includes("Ferrer") || p.name.includes("Carlos")) {
                console.log(`\nPlayer: ${p.name}`);
                console.log("Root Stats:", p.stats);
                console.log("History:", JSON.stringify(p.historial, null, 2));

                if (p.historial && Array.isArray(p.historial)) {
                    const sum = p.historial.reduce((acc, h) => (acc + (h.puntos || 0)), 0);
                    console.log("Sum of History Points:", sum);
                }
            }
        });

    } catch (e) {
        console.error(e);
    }
}

checkDb();
