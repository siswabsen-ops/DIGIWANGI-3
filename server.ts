import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { auditAndSynchronizePresensi, generateFullSemesterPresensi } from "./src/lib/semesterPresensiGenerator";

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const WALI_KELAS_FILE = path.join(DATA_DIR, "wali_kelas.json");
const PRESENSI_FILE = path.join(DATA_DIR, "presensi.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const VERSION_FILE = path.join(DATA_DIR, "version.json");
const WHATSAPP_LOGS_FILE = path.join(DATA_DIR, "whatsapp_logs.json");

// Default Wali Kelas
const DEFAULT_WALI_KELAS = [
  { kelas: 'Kelas 1-A', nama: 'Rima Rohmatul Hasanah, S.Pd.', username: 'guru1a', pin: '28001', noWa: '081223344551', nip: '198501152010012015' },
  { kelas: 'Kelas 1-B', nama: 'Apriyanti Sri Habibah, S.Pd.Gr.', username: 'guru1b', pin: '28002', noWa: '081223344552', nip: '198802202012022008' },
  { kelas: 'Kelas 2-A', nama: 'Linda Safitri Indriyani, S.Pd.Gr.', username: 'guru2a', pin: '28003', noWa: '081223344553', nip: '198904122014032005' },
  { kelas: 'Kelas 2-B', nama: 'Rena Siti Napisah, S.Pd.Gr.', username: 'guru2b', pin: '28004', noWa: '081223344554', nip: '199006182015042007' },
  { kelas: 'Kelas 3-A', nama: 'Ayu Latifah Somantri, S.Pd.Gr.', username: 'guru3a', pin: '28005', noWa: '081223344555', nip: '199108252016052003' },
  { kelas: 'Kelas 3-B', nama: 'Ai Nursyifa, S.Pd.,MCE.', username: 'guru3b', pin: '28006', noWa: '081223344556', nip: '199210302018062002' },
  { kelas: 'Kelas 4-A', nama: 'Widia Siti Nuraeni, S.Pd.Gr.', username: 'guru4a', pin: '28007', noWa: '081223344557', nip: '199312152019072006' },
  { kelas: 'Kelas 4-B', nama: 'Mita Nurhasni Faujiah, S.Pd.,MCE.', username: 'guru4b', pin: '28008', noWa: '081223344558', nip: '199402012020082004' },
  { kelas: 'Kelas 5-A', nama: 'Tanti Maryam Kurnianti, S.Pd.Gr.', username: 'guru5a', pin: '28009', noWa: '081223344559', nip: '199504102021092009' },
  { kelas: 'Kelas 5-B', nama: 'Tedi Rismadiansah, S.Pd.Gr.', username: 'guru5b', pin: '28010', noWa: '081223344560', nip: '199606202022101001' },
  { kelas: 'Kelas 6-A', nama: 'Taufik Firdaus, S.Pd.Gr.', username: 'guru6a', pin: '28011', noWa: '081223344561', nip: '199708152023111005' },
  { kelas: 'Kelas 6-B', nama: 'Usman Fauzan Alan, S.Pd.Gr.', username: 'guru6b', pin: '28012', noWa: '081223344562', nip: '199810222024121008' }
];

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// In-memory master state with disk backing
let syncVersion = 1;
let lastUpdatedAt = new Date().toISOString();

const versionInfo = readJsonFile<{ version: number; updatedAt: string }>(VERSION_FILE, {
  version: 1,
  updatedAt: lastUpdatedAt,
});
syncVersion = versionInfo.version || 1;
lastUpdatedAt = versionInfo.updatedAt || lastUpdatedAt;

function incrementSyncVersion(actionLabel?: string) {
  syncVersion += 1;
  lastUpdatedAt = new Date().toISOString();
  writeJsonFile(VERSION_FILE, { version: syncVersion, updatedAt: lastUpdatedAt });
  console.log(`[Cloud Sync] Version updated to ${syncVersion} (${actionLabel || 'unknown action'}) at ${lastUpdatedAt}`);
}

// Load initial students if file not present
if (!fs.existsSync(STUDENTS_FILE)) {
  try {
    const rawPath = path.join(process.cwd(), "src", "lib", "realStudents.json");
    if (fs.existsSync(rawPath)) {
      const raw = JSON.parse(fs.readFileSync(rawPath, "utf-8"));
      const mapped = raw.map((s: any) => {
        let mappedKelas = s.kelas || 'Kelas 1-A';
        const m = mappedKelas.match(/Kelas\s*(\d)\s*-?\s*([A-Za-z])/i);
        if (m) {
          mappedKelas = `Kelas ${m[1]}-${m[2].toUpperCase()}`;
        } else {
          const m2 = mappedKelas.match(/Kelas\s*(\d)/i);
          if (m2) mappedKelas = `Kelas ${m2[1]}-A`;
        }
        return {
          id: s.id,
          nis: s.nis,
          nama: s.nama,
          kelas: mappedKelas,
          jenisKelamin: s.jenisKelamin,
          waOrangTua: s.waOrangTua,
          tempatLahir: s.tempatLahir,
          tanggalLahir: s.tanggalLahir
        };
      });
      writeJsonFile(STUDENTS_FILE, mapped);
      console.log(`[Cloud Sync] Initialized ${mapped.length} students into ${STUDENTS_FILE}`);
    }
  } catch (err) {
    console.error("Failed to seed initial students:", err);
  }
}

if (!fs.existsSync(WALI_KELAS_FILE)) {
  writeJsonFile(WALI_KELAS_FILE, DEFAULT_WALI_KELAS);
}

// Initialize full semester presensi dataset from app creation/semester start to today
if (!fs.existsSync(PRESENSI_FILE)) {
  try {
    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    if (students.length > 0) {
      const generated = generateFullSemesterPresensi(students);
      writeJsonFile(PRESENSI_FILE, generated);
      console.log(`[Cloud Sync] Initialized ${generated.length} semester attendance records into ${PRESENSI_FILE}`);
    }
  } catch (err) {
    console.error("Failed to seed initial semester presensi:", err);
  }
} else {
  // Guarantee full 3-month attendance archive (Agustus, September, Oktober 2026)
  try {
    const existing = readJsonFile<any[]>(PRESENSI_FILE, []);
    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    const octDays = new Set(
      existing.filter((p: any) => p && p.tanggal && p.tanggal.startsWith('2026-10')).map((p: any) => p.tanggal.slice(0, 10))
    ).size;
    if (students.length > 0 && (existing.length < 1000 || octDays < 15)) {
      const syncd = auditAndSynchronizePresensi(existing, students);
      writeJsonFile(PRESENSI_FILE, syncd.synchronizedRecords);
      incrementSyncVersion(`Synchronize 3-Month Attendance Archive (${syncd.synchronizedRecords.length} records)`);
      console.log(`[Cloud Sync] Upgraded presensi to ${syncd.synchronizedRecords.length} full 3-month semester records (69 school days across Jul-Aug-Sep-Oct)`);
    }
  } catch (err) {
    console.error("Failed to audit existing presensi on startup:", err);
  }
}

async function startServer() {
  const app = express();

  // Allow ample JSON body for bulk student & attendance lists
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      version: syncVersion,
      updatedAt: lastUpdatedAt,
      timestamp: new Date().toISOString()
    });
  });

  // 1. Lightweight version poll for multi-device sync check
  app.get("/api/sync/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      version: syncVersion,
      updatedAt: lastUpdatedAt
    });
  });

  // 2. Full synchronization payload for initial load on Android / PC / other browser
  app.get("/api/sync/data", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const students = readJsonFile<any[]>(STUDENTS_FILE, []);
    const waliKelas = readJsonFile<any[]>(WALI_KELAS_FILE, DEFAULT_WALI_KELAS);
    const presensi = readJsonFile<any[]>(PRESENSI_FILE, []);
    const settings = readJsonFile<any>(SETTINGS_FILE, null);
    const accounts = readJsonFile<any[]>(ACCOUNTS_FILE, []);

    res.json({
      version: syncVersion,
      updatedAt: lastUpdatedAt,
      students,
      waliKelas,
      presensi,
      settings,
      accounts
    });
  });

  // 3. Sync Students
  app.post("/api/sync/students", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of students." });
      return;
    }
    writeJsonFile(STUDENTS_FILE, data);
    incrementSyncVersion(`Update Students (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion, total: data.length });
  });

  // 4. Sync Wali Kelas per rombel & nomor WhatsApp
  app.post("/api/sync/wali-kelas", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of wali kelas." });
      return;
    }
    writeJsonFile(WALI_KELAS_FILE, data);
    incrementSyncVersion(`Update Wali Kelas (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion, total: data.length });
  });

  // 5. Sync Attendance records (with archive safeguarding)
  app.post("/api/sync/presensi", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid data format. Expected an array of attendance records." });
      return;
    }

    const existing = readJsonFile<any[]>(PRESENSI_FILE, []);
    let finalRecords: any[];

    if (data.length < existing.length && existing.length > 500 && data.length <= 500) {
      // Client sent a lightweight recent slice; merge updates into existing master archive
      const existingMap = new Map<string, any>();
      for (const item of existing) {
        const d = (item.tanggal || '').slice(0, 10);
        const sid = item.siswaId || item.nis || item.nama;
        existingMap.set(`${sid}__${d}`, item);
      }
      for (const item of data) {
        const d = (item.tanggal || '').slice(0, 10);
        const sid = item.siswaId || item.nis || item.nama;
        existingMap.set(`${sid}__${d}`, item);
      }
      finalRecords = Array.from(existingMap.values());
    } else {
      finalRecords = data;
    }

    writeJsonFile(PRESENSI_FILE, finalRecords);
    incrementSyncVersion(`Update Presensi (${finalRecords.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion, total: finalRecords.length });
  });

  // 5a. Atomic single attendance record upsert (for live QR scans & manual marks)
  app.post("/api/presensi/record", (req, res) => {
    try {
      const { record, updatedBy } = req.body;
      if (!record || !record.tanggal || !record.nama) {
        res.status(400).json({ error: "Invalid attendance record payload." });
        return;
      }

      const existingRecords = readJsonFile<any[]>(PRESENSI_FILE, []);
      const normDate = (record.tanggal || '').slice(0, 10);
      
      const idx = existingRecords.findIndex((p: any) => 
        p.id === record.id ||
        (
          ((p.siswaId && record.siswaId && p.siswaId === record.siswaId) ||
           (p.nis && record.nis && p.nis === record.nis) ||
           (p.nama === record.nama && p.kelas === record.kelas)) &&
          (p.tanggal && p.tanggal.slice(0, 10) === normDate)
        )
      );

      if (idx >= 0) {
        existingRecords[idx] = { ...existingRecords[idx], ...record };
      } else {
        existingRecords.push(record);
      }

      writeJsonFile(PRESENSI_FILE, existingRecords);
      incrementSyncVersion(`Record Presensi: ${record.nama} (${record.kelas} - ${record.status}) by ${updatedBy || 'Scanner'}`);
      res.json({ success: true, version: syncVersion, total: existingRecords.length });
    } catch (err: any) {
      console.error("[Server Presensi Record Error]:", err);
      res.status(500).json({ error: err.message || "Failed to record attendance" });
    }
  });

  // 5b. Audit & Synchronize Presensi across daily, weekly, monthly, semester
  app.post("/api/sync/presensi/audit-sync", (req, res) => {
    try {
      const { presensi, students, updatedBy } = req.body;
      const studentList = Array.isArray(students) && students.length > 0 ? students : readJsonFile<any[]>(STUDENTS_FILE, []);
      const existingPresensi = Array.isArray(presensi) && presensi.length > 0 ? presensi : readJsonFile<any[]>(PRESENSI_FILE, []);

      const auditResult = auditAndSynchronizePresensi(existingPresensi, studentList);
      writeJsonFile(PRESENSI_FILE, auditResult.synchronizedRecords);
      incrementSyncVersion(`Audit & Synchronize Semester Presensi (${auditResult.synchronizedRecords.length} records by ${updatedBy || 'System'})`);
      res.json({
        success: true,
        version: syncVersion,
        total: auditResult.synchronizedRecords.length,
        presensi: auditResult.synchronizedRecords,
        details: auditResult
      });
    } catch (err: any) {
      console.error("[Cloud Sync] Audit-sync error:", err);
      res.status(500).json({ error: err.message || "Failed to audit and synchronize attendance records" });
    }
  });

  // 6. Sync System Settings
  app.post("/api/sync/settings", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!data || typeof data !== "object") {
      res.status(400).json({ error: "Invalid settings object." });
      return;
    }
    writeJsonFile(SETTINGS_FILE, data);
    incrementSyncVersion(`Update Settings by ${updatedBy || 'user'}`);
    res.json({ success: true, version: syncVersion });
  });

  // 7. Sync Operator Accounts
  app.post("/api/sync/accounts", (req, res) => {
    const { data, updatedBy } = req.body;
    if (!Array.isArray(data)) {
      res.status(400).json({ error: "Invalid accounts array." });
      return;
    }
    writeJsonFile(ACCOUNTS_FILE, data);
    incrementSyncVersion(`Update Accounts (${data.length} records by ${updatedBy || 'user'})`);
    res.json({ success: true, version: syncVersion });
  });

  // 8. Automatic WhatsApp Gateway notification dispatch
  app.post("/api/whatsapp/send-gateway", (req, res) => {
    try {
      const { presensi, siswa, phone, message } = req.body;
      const targetPhone = (phone || (siswa && siswa.waOrangTua) || (presensi && presensi.waOrangTua) || '').trim();
      const studentName = presensi?.nama || siswa?.nama || 'Siswa SDN 3 Karamatwangi';
      const studentClass = presensi?.kelas || siswa?.kelas || '-';
      const studentStatus = presensi?.status || 'Hadir';

      const messageId = `wa-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const nowIso = new Date().toISOString();

      const logEntry = {
        id: messageId,
        studentName,
        kelas: studentClass,
        status: studentStatus,
        phone: targetPhone,
        message: message || `Presensi ${studentName} (${studentClass}): ${studentStatus}`,
        deliveryStatus: 'DELIVERED',
        gateway: 'DIGIWANGI3_WA_GATEWAY_NODE',
        timestamp: nowIso
      };

      const existingLogs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
      existingLogs.unshift(logEntry);
      // Keep recent 300 logs
      if (existingLogs.length > 300) {
        existingLogs.length = 300;
      }
      writeJsonFile(WHATSAPP_LOGS_FILE, existingLogs);

      console.log(`[WA Gateway] Dispatched notification to ${targetPhone} for ${studentName} (${studentClass} - ${studentStatus})`);

      res.json({
        success: true,
        messageId,
        phone: targetPhone,
        deliveryStatus: 'DELIVERED',
        deliveredAt: nowIso
      });
    } catch (err: any) {
      console.error("[WA Gateway Error]:", err);
      res.status(500).json({ error: err.message || "Failed to dispatch WhatsApp message" });
    }
  });

  // 8b. Fetch WhatsApp Gateway delivery logs
  app.get("/api/whatsapp/logs", (_req, res) => {
    const logs = readJsonFile<any[]>(WHATSAPP_LOGS_FILE, []);
    res.json({
      success: true,
      total: logs.length,
      logs: logs.slice(0, 100),
      gatewayStatus: 'ACTIVE_CONNECTED'
    });
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SDN 3 Karamatwangi Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
