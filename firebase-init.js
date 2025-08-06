// Unified Firebase initialization file
// This file loads Firebase App and Firestore compatibility builds and
// initialises the default app with the provided configuration. It
// attaches the firestore instance to the global window object as
// `db` so that other scripts (e.g. script.js) can access it. If the
// Firebase libraries fail to load, `window.db` remains undefined and
// the website will fall back to using localStorage.

// Load the compat versions of Firebase App and Firestore. These
// scripts are served from Google's CDN and work without build tools.
// They must be loaded before running this file.
// Note: These script tags are not included here; they should be
// loaded in the HTML <head> before including this file.

// Firebase configuration for UMUW site. The storage bucket domain
// uses `.appspot.com` as required by Firebase projects.
const firebaseConfig = {
  apiKey: "AIzaSyDjCXjHPGoWacnb7HF3ESIQcorIWeCg9g4",
  authDomain: "umuw-92b53.firebaseapp.com",
  projectId: "umuw-92b53",
  storageBucket: "umuw-92b53.appspot.com",
  messagingSenderId: "608743695486",
  appId: "1:608743695486:web:ac1c6c9d4fee330f6be42f",
  measurementId: "G-MG8NMP4G5Y"
};

// Initialise Firebase only once
if (typeof firebase !== 'undefined' && !firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
  // Expose Firestore instance globally
  if (firebase.firestore) {
    window.db = firebase.firestore();
  }
}