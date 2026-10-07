// Partes do SDK do Firebase usadas pelo app. cloud.js carrega este módulo com import(), para o
// SDK não pesar na abertura do app; o build o coloca num arquivo próprio (firebase-sdk-*.js).
export { initializeApp } from 'firebase/app';
export {
    getAuth, connectAuthEmulator, onAuthStateChanged, signInWithPopup, signInWithCredential, signOut,
    GoogleAuthProvider
} from 'firebase/auth';
export {
    initializeFirestore, connectFirestoreEmulator, doc, collection, query, where, getDoc, getDocs, writeBatch,
    serverTimestamp, deleteField, Timestamp
} from 'firebase/firestore';
