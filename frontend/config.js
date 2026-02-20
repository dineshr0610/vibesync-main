//
const API_URL = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '172.24.32.1'
    ? `http://${window.location.hostname}:5000`
    : 'https://vibesync-backend-4vap.onrender.com';
