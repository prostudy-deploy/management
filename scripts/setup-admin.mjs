import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpCdILN0oMT1DpZVN1ETQXCRACiFvdFFg",
  authDomain: "komras.firebaseapp.com",
  projectId: "komras",
  storageBucket: "komras.firebasestorage.app",
  messagingSenderId: "577036276254",
  appId: "1:577036276254:web:2a3615a80a00d9b9a1140f",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const adminUid = "phLF6MkB4AeTDC8p9pBaiG9eBZ63";

async function setupAdmin() {
  await setDoc(doc(db, "users", adminUid), {
    uid: adminUid,
    email: "admin@prostudy.de",
    displayName: "Admin",
    role: "admin",
    isActive: true,
    createdAt: Timestamp.now(),
  });

  console.log("Admin-User in Firestore angelegt!");
  process.exit(0);
}

setupAdmin().catch((err) => {
  console.error("Fehler:", err);
  process.exit(1);
});
