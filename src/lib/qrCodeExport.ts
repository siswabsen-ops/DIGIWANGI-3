import QRCode from 'qrcode';
import JSZip from 'jszip';
import { Siswa, getStudentQRIdentifier } from '../types';

/**
 * Helper to trigger browser download for a Blob
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Generate a high quality student QR card on an offscreen HTML5 canvas
 */
export async function generateStudentQRCardCanvas(siswa: Siswa): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const width = 600;
  const height = 820;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Outer border & subtle shadow border
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#1d4ed8'; // Primary blue
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Inner border
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#93c5fd';
  ctx.strokeRect(18, 18, width - 36, height - 36);

  // Header Banner
  const headerHeight = 110;
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(22, 22, width - 44, headerHeight);

  // Header Text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('KARTU ABSENSI QR SISWA', width / 2, 55);

  ctx.font = '900 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('SDN 3 KARAMATWANGI', width / 2, 95);

  // Generate QR Code Image data
  const qrPayload = getStudentQRIdentifier(siswa);
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 380,
    margin: 1.5,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  // Load and draw QR code
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Draw white background container with rounded border for QR
      const qrBoxSize = 360;
      const qrBoxX = (width - qrBoxSize) / 2;
      const qrBoxY = 155;

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize);

      ctx.drawImage(img, qrBoxX + 10, qrBoxY + 10, qrBoxSize - 20, qrBoxSize - 20);
      resolve();
    };
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  // Student Information Box
  const isBelumDapodik = siswa.statusDapodik === 'Belum Dapodik';
  
  // Student Name
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Dynamic font sizing for long student names
  let nameFontSize = 26;
  if (siswa.nama.length > 25) nameFontSize = 22;
  if (siswa.nama.length > 35) nameFontSize = 19;
  ctx.font = `900 ${nameFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(siswa.nama.toUpperCase(), width / 2, 535);

  // Class & Dapodik Badge
  const infoY = 585;
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(`KELAS: ${siswa.kelas.toUpperCase()}`, width / 2, infoY);

  // Identifier (NIS / NIK)
  const idY = 625;
  if (isBelumDapodik) {
    ctx.fillStyle = '#b91c1c'; // Red for non-dapodik NIK
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`NIK: ${siswa.nik || qrPayload} (Belum Dapodik)`, width / 2, idY);
  } else {
    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 21px monospace';
    ctx.fillText(`NIS: ${siswa.nis}${siswa.nik ? ` • NIK: ${siswa.nik}` : ''}`, width / 2, idY);
  }

  // Parent WA
  ctx.fillStyle = '#64748b';
  ctx.font = '16px system-ui, -apple-system, sans-serif';
  ctx.fillText(`WA Wali: ${siswa.waOrangTua || '-'}`, width / 2, 665);

  // QR Payload text indicator
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px monospace';
  ctx.fillText(`Kode Scan: ${qrPayload}`, width / 2, 700);

  // Footer separator & text
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(35, 735);
  ctx.lineTo(width - 35, 735);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('DIGIWANGI 3 Presensi • Kec. Cisurupan, Garut', width / 2, 755);

  return canvas;
}

/**
 * Download a single student QR card as PNG
 */
export async function downloadSingleStudentQR(siswa: Siswa) {
  const canvas = await generateStudentQRCardCanvas(siswa);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const cleanName = siswa.nama.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanKelas = siswa.kelas.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `QR_${cleanKelas}_${cleanName}_${siswa.nis || 'ID'}.png`;
    triggerFileDownload(blob, filename);
  }, 'image/png');
}

/**
 * Download a ZIP package containing all student QR codes for a given class or all classes
 */
export async function downloadClassQRZip(
  targetKelas: string,
  siswaList: Siswa[],
  onProgress?: (current: number, total: number, currentName: string) => void
): Promise<void> {
  const studentsToExport = siswaList.filter((s) => {
    if (targetKelas === 'Semua Kelas' || !targetKelas) return true;
    return s.kelas.trim().toLowerCase() === targetKelas.trim().toLowerCase();
  });

  if (studentsToExport.length === 0) {
    throw new Error(`Tidak ada siswa ditemukan untuk ${targetKelas}`);
  }

  // Sort alphabetically by name
  studentsToExport.sort((a, b) => a.nama.localeCompare(b.nama));

  const zip = new JSZip();
  const folderName = targetKelas === 'Semua Kelas' 
    ? 'QR_Codes_Semua_Kelas_SDN3Karamatwangi' 
    : `QR_Codes_${targetKelas.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  const rootFolder = zip.folder(folderName) || zip;

  // Build CSV metadata summary inside ZIP
  let csvContent = 'No,Nama Siswa,Kelas,Jenis Kelamin,Status Dapodik,NIS,NIK,NISN,Kode QR (Payload),No WA Wali\n';

  for (let i = 0; i < studentsToExport.length; i++) {
    const student = studentsToExport[i];
    const indexStr = String(i + 1).padStart(2, '0');
    const qrPayload = getStudentQRIdentifier(student);

    if (onProgress) {
      onProgress(i + 1, studentsToExport.length, student.nama);
    }

    // Add to CSV
    csvContent += `"${i + 1}","${student.nama}","${student.kelas}","${student.jenisKelamin}","${student.statusDapodik || 'Sudah Dapodik'}","'${student.nis}'","'${student.nik || ''}'","'${student.nisn || ''}'","'${qrPayload}'","'${student.waOrangTua}'"\n`;

    // Render Canvas
    const canvas = await generateStudentQRCardCanvas(student);
    
    // Convert to PNG blob/arrayBuffer
    const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
    
    const cleanName = student.nama.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanNis = (student.nis || student.nik || 'ID').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${indexStr}_${cleanName}_${cleanNis}.png`;

    // Put into subfolder if exporting all classes
    if (targetKelas === 'Semua Kelas') {
      const classFolder = rootFolder.folder(student.kelas.replace(/[^a-zA-Z0-9]/g, '_')) || rootFolder;
      classFolder.file(fileName, pngBase64, { base64: true });
    } else {
      rootFolder.file(fileName, pngBase64, { base64: true });
    }
  }

  // Add CSV and Readme file to ZIP
  rootFolder.file('DAFTAR_DATA_SISWA_QR.csv', csvContent);
  rootFolder.file(
    'PETUNJUK_PENGGUNAAN_QR.txt',
    `==================================================
KARTU QR CODE ABSENSI SISWA SDN 3 KARAMATWANGI
==================================================
Target: ${targetKelas}
Total Siswa: ${studentsToExport.length} Siswa
Tanggal Dibuat: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

PETUNJUK PENGGUNAAN:
1. Gambar QR Code berformat PNG dengan resolusi tinggi (600x820px).
2. Setiap kartu berisi identitas resmi siswa, nama rombel, dan kode QR unik.
3. Kartu siap langsung dicetak atau dicetak pada kartu PVC/ID Card gantungan siswa.
4. Siswa yang belum memiliki NIS Dapodik telah otomatis dibuatkan QR menggunakan NIK Kependudukan.

Sistem Presensi Siswa SDN 3 Karamatwangi
Cisurupan, Kab. Garut
==================================================
`
  );

  // Generate ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const zipFileName = `QR_Code_${targetKelas.replace(/[^a-zA-Z0-9]/g, '_')}_SDN3_Karamatwangi.zip`;
  triggerFileDownload(zipBlob, zipFileName);
}
