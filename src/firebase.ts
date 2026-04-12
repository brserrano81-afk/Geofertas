import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: 'AIzaSyDVW8oK9luHCFZhRl28XjcoZlDgeVA2y0Y',
    authDomain: 'geofertas-325b0.firebaseapp.com',
    projectId: 'geofertas-325b0',
    storageBucket: 'geofertas-325b0.firebasestorage.app',
    messagingSenderId: '333137067503',
    appId: '1:333137067503:web:f2ad402d55e33a0c60ca1a',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
