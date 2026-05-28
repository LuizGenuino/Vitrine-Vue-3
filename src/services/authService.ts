import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    type User,
} from 'firebase/auth';
import { auth } from './firebase';

export const authService = {
    async register(email: string, password: string) {
        return createUserWithEmailAndPassword(auth, email, password);
    },
    async login(email: string, password: string) {
        return signInWithEmailAndPassword(auth, email, password);
    },
    async logout() {
        return signOut(auth);
    },
    subscribe(callback: (user: User | null) => void) {
        return onAuthStateChanged(auth, callback);
    },
    async sendPasswordResetEmail(email: string) {
        return sendPasswordResetEmail(auth, email);
    }
};
