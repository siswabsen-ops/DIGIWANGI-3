import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Siswa, Presensi } from '../types';

const provider = new GoogleAuthProvider();
// Request Google Workspace scopes
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize Auth listener
export const initAuth = (
  onAuthSuccess?: (user: FirebaseUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Google Sign-In function
export const googleSignIn = async (): Promise<{ user: FirebaseUser; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error('Gagal mendapatkan token akses OAuth Google. Pastikan izin telah diberikan.');
    }
    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (err: any) {
    console.error('Google Sign In Error:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export const getCachedToken = () => cachedAccessToken;

/**
 * Check if the specified spreadsheet ID is valid and writable.
 * If sheet "Siswa" and "Presensi" don't exist, we'll try to create them.
 */
export const checkAndPrepareSpreadsheet = async (
  accessToken: string,
  spreadsheetId: string
): Promise<{ success: boolean; sheetNames: string[]; error?: string }> => {
  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { success: false, sheetNames: [], error: 'Spreadsheet ID tidak ditemukan di Google Drive Anda atau ID tidak valid.' };
      }
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `HTTP kesalahan ${res.status}`;
      return { success: false, sheetNames: [], error: errMsg };
    }

    const data = await res.json();
    const sheets = data.sheets || [];
    const sheetNames = sheets.map((s: any) => s.properties?.title || '');

    const requiredSheets = ['Siswa', 'Presensi'];
    const missingSheets = requiredSheets.filter((req) => !sheetNames.includes(req));

    if (missingSheets.length > 0) {
      // Create missing sheets using batchUpdate
      const requests = missingSheets.map((title) => ({
        addSheet: {
          properties: { title },
        },
      }));

      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        return {
          success: false,
          sheetNames,
          error: `Gagal menambahkan lembar ('Siswa' dan 'Presensi') otomatis: ${errData?.error?.message || 'Keterbatasan akses'}`,
        };
      }
      
      const updatedNames = [...sheetNames, ...missingSheets];
      return { success: true, sheetNames: updatedNames };
    }

    return { success: true, sheetNames };
  } catch (err: any) {
    return { success: false, sheetNames: [], error: err.message || 'Kesalahan jaringan saat menghubungi Google API.' };
  }
};

/**
 * Helper to parse CSV string into 2D array
 */
const parseCsvToRows = (csvText: string): string[][] => {
  const lines = csvText.split(/\r?\n/);
  return lines
    .map((line) => {
      const row: string[] = [];
      let insideQuote = false;
      let entry = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          row.push(entry.trim());
          entry = '';
        } else {
          entry += char;
        }
      }
      row.push(entry.trim());
      return row.map((cell) => cell.replace(/^"(.*)"$/, '$1').trim());
    })
    .filter((r) => r.some((cell) => cell.length > 0));
};

/**
 * Fallback helper to fetch public Google Spreadsheet as CSV
 */
const fetchSpreadsheetAsCsv = async (spreadsheetId: string, sheetName: string): Promise<string[][]> => {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Spreadsheet tidak dapat diakses atau ID Google Spreadsheet tidak valid.');
  }
  const csvText = await res.text();
  return parseCsvToRows(csvText);
};

/**
 * Fetch updated Students database from Google Sheets
 */
export const fetchStudentsFromSheet = async (
  accessToken: string | null,
  spreadsheetId: string
): Promise<{ success: boolean; students?: Siswa[]; error?: string }> => {
  if (!spreadsheetId) {
    return { success: false, error: 'Google Spreadsheet ID belum dikonfigurasi.' };
  }

  try {
    let rows: string[][] = [];

    if (accessToken) {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Siswa!A1:Z2000`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        rows = data.values || [];
      } else {
        // Fallback to public CSV endpoint
        try {
          rows = await fetchSpreadsheetAsCsv(spreadsheetId, 'Siswa');
        } catch {
          return {
            success: false,
            error: `Spreadsheet tidak dapat diakses atau ID Google Spreadsheet tidak valid. Silakan hubungkan akun Google Anda di menu Pengaturan.`
          };
        }
      }
    } else {
      try {
        rows = await fetchSpreadsheetAsCsv(spreadsheetId, 'Siswa');
      } catch {
        return {
          success: false,
          error: `Spreadsheet tidak dapat diakses atau ID Google Spreadsheet tidak valid. Silakan hubungkan akun Google Anda di menu Pengaturan.`
        };
      }
    }

    if (!rows || rows.length <= 1) {
      return { success: false, error: 'Data lembar "Siswa" di Google Spreadsheet kosong atau belum berisi baris data.' };
    }

    const fetchedStudents: Siswa[] = [];
    const headerRow = rows[0].map((h) => String(h).toLowerCase().trim());

    // Dynamically match column indices
    const idIdx = headerRow.findIndex((h) => h.includes('id'));
    const nisIdx = headerRow.findIndex((h) => h.includes('nis'));
    const namaIdx = headerRow.findIndex((h) => h.includes('nama'));
    const kelasIdx = headerRow.findIndex((h) => h.includes('kelas'));
    const jkIdx = headerRow.findIndex((h) => h.includes('jenis') || h.includes('kelamin') || h === 'jk');
    const waIdx = headerRow.findIndex((h) => h.includes('wa') || h.includes('orang') || h.includes('hp') || h.includes('telepon') || h.includes('parent'));

    const colId = idIdx !== -1 ? idIdx : 0;
    const colNis = nisIdx !== -1 ? nisIdx : 1;
    const colNama = namaIdx !== -1 ? namaIdx : 2;
    const colKelas = kelasIdx !== -1 ? kelasIdx : 3;
    const colJk = jkIdx !== -1 ? jkIdx : 4;
    const colWa = waIdx !== -1 ? waIdx : 5;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const rawNama = row[colNama] ? String(row[colNama]).trim() : '';
      const rawNis = row[colNis] ? String(row[colNis]).trim() : '';
      if (!rawNama && !rawNis) continue;

      const id = row[colId] && String(row[colId]).trim() ? String(row[colId]).trim() : `sis-${Date.now()}-${i}`;
      const nis = rawNis || `100${i}`;
      const nama = rawNama || `Siswa ${i}`;
      const kelas = row[colKelas] ? String(row[colKelas]).trim() : 'Kelas 1-A';

      const jkRaw = row[colJk] ? String(row[colJk]).trim().toUpperCase() : 'L';
      const jenisKelamin: 'L' | 'P' = jkRaw.startsWith('P') || jkRaw === 'PEREMPUAN' || jkRaw === 'FEMALE' ? 'P' : 'L';

      let waOrangTua = row[colWa] ? String(row[colWa]).trim() : '081234567890';
      if (waOrangTua.startsWith('62')) {
        waOrangTua = '0' + waOrangTua.slice(2);
      }

      fetchedStudents.push({
        id,
        nis,
        nama,
        kelas,
        jenisKelamin,
        waOrangTua,
      });
    }

    if (fetchedStudents.length === 0) {
      return { success: false, error: 'Tidak ditemukan data siswa yang valid di lembar "Siswa".' };
    }

    return { success: true, students: fetchedStudents };
  } catch (err: any) {
    console.error('Error fetching students from sheet:', err);
    return { success: false, error: err.message || 'Gagal membaca data dari Google Spreadsheet.' };
  }
};

/**
 * Sync Students data to Google Sheets
 */
export const syncStudentsToSheet = async (
  accessToken: string,
  spreadsheetId: string,
  students: Siswa[]
): Promise<boolean> => {
  // Clear the Siswa sheet first (from row A1 to Z1000)
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Siswa!A1:Z1000:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Prepare header + row values
  const values = [
    ['ID Siswa', 'NIS', 'Nama Lengkap', 'Kelas', 'Jenis Kelamin', 'Nomor WA Orang Tua'],
    ...students.map((s) => [s.id, s.nis, s.nama, s.kelas, s.jenisKelamin, s.waOrangTua]),
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Siswa!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  return res.ok;
};

/**
 * Sync Attendance logs to Google Sheets
 */
export const syncAttendanceToSheet = async (
  accessToken: string,
  spreadsheetId: string,
  presensiList: Presensi[]
): Promise<boolean> => {
  // Clear the Presensi sheet first (from row A1 to Z10000)
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Presensi!A1:Z10000:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Prepare header + row values
  const values = [
    ['ID Presensi', 'ID Siswa', 'NIS', 'Nama Siswa', 'Kelas', 'Tanggal', 'Waktu', 'Status Kehadiran', 'Status WhatsApp', 'Pesan Terkirim', 'Operator Input'],
    ...presensiList.map((p) => [
      p.id,
      p.siswaId,
      p.nis,
      p.nama,
      p.kelas,
      p.tanggal,
      p.waktu,
      p.status,
      p.waStatus,
      p.pesanTerkirim || '',
      p.operator,
    ]),
  ];

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Presensi!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  return res.ok;
};

/**
 * Create a brand new Google Spreadsheet with Siswa & Presensi sheets
 */
export const createNewSpreadsheet = async (accessToken: string, title: string): Promise<string> => {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: [
        { properties: { title: 'Siswa' } },
        { properties: { title: 'Presensi' } },
      ],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || 'Gagal membuat Spreadsheet baru.');
  }

  const data = await res.json();
  return data.spreadsheetId;
};

/**
 * Upload backup file to Google Drive folder
 */
export const uploadBackupFileToDrive = async (
  accessToken: string,
  folderId: string,
  fileName: string,
  contentStr: string,
  mimeType: string = 'text/csv'
): Promise<string> => {
  // 1. Create file with metadata
  const metadataRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      parents: [folderId],
      mimeType,
    }),
  });

  if (!metadataRes.ok) {
    const errData = await metadataRes.json().catch(() => ({}));
    throw new Error(`Gagal menyiapkan backup dokumen di Drive: ${errData?.error?.message || 'Izin folder tidak valid'}`);
  }

  const fileData = await metadataRes.json();
  const fileId = fileData.id;

  // 2. Upload file content data
  const contentRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
    },
    body: contentStr,
  });

  if (!contentRes.ok) {
    const errData = await contentRes.json().catch(() => ({}));
    throw new Error(`Gagal mengirimkan data backup ke storage Drive: ${errData?.error?.message || 'Kegagalan upload'}`);
  }

  return fileId;
};
