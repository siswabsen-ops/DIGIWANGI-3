import digiwangiOfficial from './images/logo_digiwangi3_official.png';
import garutOfficialImg from './images/logo_kabupaten_garut_1788186988383.jpg';
import disdikOfficialImg from './images/logo_dinas_pendidikan_1788187004472.jpg';
import { DIGIWANGI_LOGO_BASE64 } from './logoBase64';

export const DEFAULT_DIGIWANGI_LOGO = digiwangiOfficial || DIGIWANGI_LOGO_BASE64;
export const DEFAULT_GARUT_LOGO = garutOfficialImg;
export const DEFAULT_DISDIK_LOGO = disdikOfficialImg;
export const DEFAULT_SDN3_LOGO = DEFAULT_DIGIWANGI_LOGO;

// SVG Data URLs for fallback rendering
export const FALLBACK_GARUT_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%231e3a8a"/><stop offset="100%" stop-color="%23047857"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="%23ffffff" stroke="%23f59e0b" stroke-width="4"/><path d="M50 12 L78 30 L78 70 L50 88 L22 70 L22 30 Z" fill="url(%23g1)" stroke="%23fbbf24" stroke-width="2"/><polygon points="50,26 62,54 38,54" fill="%2310b981"/><polygon points="40,38 52,62 28,62" fill="%23059669"/><circle cx="50" cy="62" r="9" fill="%23f97316" stroke="%23fbbf24" stroke-width="1.5"/><rect x="25" y="74" width="50" height="9" rx="3" fill="%23fbbf24"/><text x="50" y="80.5" font-size="5" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="%231e293b">GARUT</text></svg>`;

export const FALLBACK_DISDIK_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%230284c7" stroke="%23fcd34d" stroke-width="3.5"/><path d="M50 16 L57 33 L75 35 L62 48 L65 66 L50 57 L35 66 L38 48 L25 35 L43 33 Z" fill="%23fbbf24" stroke="%23ffffff" stroke-width="1"/><circle cx="50" cy="46" r="11" fill="%23ffffff"/><path d="M50 37 C47 43 53 47 50 53 C46 47 53 43 50 37 Z" fill="%23dc2626"/><text x="50" y="82" font-size="5.5" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="%23ffffff" letter-spacing="0.5">TUT WURI</text><text x="50" y="88" font-size="4.5" font-weight="bold" font-family="sans-serif" text-anchor="middle" fill="%23fef08a">HANDAYANI</text></svg>`;
