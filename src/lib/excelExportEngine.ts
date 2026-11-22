import ExcelJS from 'exceljs';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function triggerExcelBlobDownload(blob: Blob, filename: string) {
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

export interface ExcelKpiCard {
  label: string;
  value: string | number;
  bgHex?: string; // ARGB e.g. 'FFDCFCE7'
  fontHex?: string; // ARGB e.g. 'FF166534'
}

export interface ExcelColumnMeta {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  isTextId?: boolean;
  isNumeric?: boolean;
  isPercent?: boolean;
  wrapText?: boolean;
}

export interface ExcelCellStyleOverride {
  fillHex?: string;
  fontHex?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ExcelLegendItem {
  code: string;
  label: string;
  fillHex: string;
  fontHex: string;
}

export interface StyledSheetConfig {
  workbook: ExcelJS.Workbook;
  sheetName: string;
  tabColor?: string;
  title: string;
  subtitle?: string;
  metaInfo: string;
  kpiCards?: ExcelKpiCard[];
  headers: string[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
  columnMeta?: ExcelColumnMeta[];
  cellStyler?: (
    rowIndex: number,
    colIndex: number,
    value: string | number,
    row: (string | number)[]
  ) => ExcelCellStyleOverride | undefined;
  legendItems?: ExcelLegendItem[];
  signatureLeftLabel?: string;
  signatureLeftName?: string;
  signatureRightLabel?: string;
  signatureRightName?: string;
  orientation?: 'landscape' | 'portrait';
}

export function sanitizeSheetName(raw: string): string {
  const cleaned = (raw || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 31) || 'Sheet';
}

export function createConfiguredWorkbook(creator: string = 'DIGIWANGI 3 - SDN 3 Karamatwangi'): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.lastModifiedBy = creator;
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

export async function workbookToXlsxBuffer(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function downloadWorkbookXlsx(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  const data = await workbookToXlsxBuffer(workbook);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: XLSX_MIME_TYPE });
  triggerExcelBlobDownload(blob, safeName);
}

export function styleAttendanceStatusCell(val: string | number): ExcelCellStyleOverride | undefined {
  const s = String(val || '').trim();
  if (s === 'Hadir' || s === '✔') {
    return { fillHex: 'FFDCFCE7', fontHex: 'FF166534', bold: true, align: 'center' };
  }
  if (s === 'Terlambat' || s === 'T') {
    return { fillHex: 'FFFEF3C7', fontHex: 'FF92400E', bold: true, align: 'center' };
  }
  if (s === 'Sakit' || s === 'S') {
    return { fillHex: 'FFE0E7FF', fontHex: 'FF3730A3', bold: true, align: 'center' };
  }
  if (s === 'Izin' || s === 'I') {
    return { fillHex: 'FFE0F2FE', fontHex: 'FF075985', bold: true, align: 'center' };
  }
  if (s === 'Alfa' || s === 'A') {
    return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
  }
  if (s === 'Belum Absen' || s === '-') {
    return { fillHex: 'FFF1F5F9', fontHex: 'FF64748B', bold: false, align: 'center' };
  }
  return undefined;
}

export function styleMetodeCell(val: string | number): ExcelCellStyleOverride | undefined {
  const s = String(val || '').toLowerCase();
  if (s.includes('qr') || s.includes('scan')) {
    return { fillHex: 'FFECFDF5', fontHex: 'FF065F46', bold: true, align: 'center' };
  }
  if (s.includes('manual') || s.includes('tap') || s.includes('wali')) {
    return { fillHex: 'FFFEF9C3', fontHex: 'FF854D0E', bold: true, align: 'center' };
  }
  return { align: 'center', fontHex: 'FF64748B' };
}

export function styleShiftCell(val: string | number): ExcelCellStyleOverride | undefined {
  const s = String(val || '').toLowerCase();
  if (s.includes('siang')) {
    return { fillHex: 'FFFFF7ED', fontHex: 'FF9A3412', bold: true, align: 'center' };
  }
  if (s.includes('pagi')) {
    return { fillHex: 'FFEFF6FF', fontHex: 'FF1E40AF', bold: true, align: 'center' };
  }
  return { align: 'center' };
}

export function styleQualificationOrRateCell(val: string | number): ExcelCellStyleOverride | undefined {
  if (typeof val === 'number') {
    const pct = val <= 1 && val >= 0 ? Math.round(val * 100) : val;
    if (pct >= 90) return { fillHex: 'FFDCFCE7', fontHex: 'FF166534', bold: true, align: 'center' };
    if (pct >= 80) return { fillHex: 'FFECFDF5', fontHex: 'FF047857', bold: true, align: 'center' };
    if (pct >= 60) return { fillHex: 'FFFEF3C7', fontHex: 'FF92400E', bold: true, align: 'center' };
    return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
  }
  const s = String(val || '').toLowerCase();
  if (s.includes('sangat baik') || s.includes('sangat tinggi') || s.includes('tuntas') || s.includes('sempurna') || s === 'b') {
    return { fillHex: 'FFDCFCE7', fontHex: 'FF166534', bold: true, align: 'center' };
  }
  if (s.includes('baik') || s.includes('tinggi') || s === 'm') {
    return { fillHex: 'FFECFDF5', fontHex: 'FF047857', bold: true, align: 'center' };
  }
  if (s.includes('cukup') || s.includes('sedang berjalan') || s === 's') {
    return { fillHex: 'FFFEF3C7', fontHex: 'FF92400E', bold: true, align: 'center' };
  }
  if (s.includes('rendah') || s.includes('perlu') || s.includes('belum mulai') || s === 'k') {
    return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
  }
  return undefined;
}

const THIN_SLATE_BORDER: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const HEADER_ACCENT_BOTTOM: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF0D9488' } };

/**
 * Membangun 1 worksheet Excel yang sangat rapih, modern, berwarna, dan siap cetak A4
 */
export function buildStyledWorksheet(config: StyledSheetConfig): ExcelJS.Worksheet {
  const {
    workbook,
    sheetName,
    tabColor = 'FF0F766E',
    title,
    subtitle = 'SDN 3 KARAMATWANGI • KECAMATAN CISURUPAN, KABUPATEN GARUT',
    metaInfo,
    kpiCards = [],
    headers,
    rows,
    totalRow,
    columnMeta = [],
    cellStyler,
    legendItems = [],
    signatureLeftLabel = 'Mengetahui, Kepala Sekolah',
    signatureLeftName = 'Cucu Maspika, S.Pd.I., M.Pd., MCE.',
    signatureRightLabel = 'Cisurupan, Garut • Penanggung Jawab / Wali Kelas',
    signatureRightName = 'Panji Teguh Amarta S, S.Pd.I',
    orientation = 'landscape'
  } = config;

  const uniqueName = (() => {
    const base = sanitizeSheetName(sheetName);
    if (!workbook.getWorksheet(base)) return base;
    for (let i = 2; i < 99; i++) {
      const candidate = sanitizeSheetName(`${base.slice(0, 27)} (${i})`);
      if (!workbook.getWorksheet(candidate)) return candidate;
    }
    return sanitizeSheetName(`S-${Date.now()}`);
  })();

  const totalCols = Math.max(4, headers.length);
  const ws = workbook.addWorksheet(uniqueName, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 }
    }
  });

  // 1. TOP INSTITUTIONAL BANNER (ROW 1)
  const r1 = ws.addRow([`PEMERINTAH KABUPATEN GARUT • DINAS PENDIDIKAN • ${subtitle}`]);
  ws.mergeCells(1, 1, 1, totalCols);
  r1.height = 22;
  const c1 = r1.getCell(1);
  c1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFE2E8F0' } };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // 2. MAIN REPORT TITLE (ROW 2)
  const r2 = ws.addRow([title]);
  ws.mergeCells(2, 1, 2, totalCols);
  r2.height = 28;
  const c2 = r2.getCell(1);
  c2.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  // 3. METADATA SUBTITLE STRIP (ROW 3)
  const r3 = ws.addRow([metaInfo]);
  ws.mergeCells(3, 1, 3, totalCols);
  r3.height = 21;
  const c3 = r3.getCell(1);
  c3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  c3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  for (let col = 1; col <= totalCols; col++) {
    r3.getCell(col).border = { bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } } };
  }

  let currentRow = 4;

  // 4. OPTIONAL MODERN KPI CARDS STRIP (2 ROWS: LABEL + VALUE)
  if (kpiCards.length > 0) {
    const spacer = ws.addRow([]);
    spacer.height = 7;
    currentRow++;

    const labelRow = ws.addRow([]);
    const valRow = ws.addRow([]);
    labelRow.height = 17;
    valRow.height = 24;

    const cardCount = Math.min(kpiCards.length, totalCols);
    const span = Math.floor(totalCols / cardCount);
    const extra = totalCols % cardCount;

    let colCursor = 1;
    for (let i = 0; i < cardCount; i++) {
      const card = kpiCards[i];
      const widthCols = span + (i < extra ? 1 : 0);
      const startCol = colCursor;
      const endCol = colCursor + widthCols - 1;
      colCursor = endCol + 1;

      const bg = card.bgHex || 'FFF8FAFC';
      const fg = card.fontHex || 'FF0F172A';

      if (endCol > startCol) {
        ws.mergeCells(currentRow, startCol, currentRow, endCol);
        ws.mergeCells(currentRow + 1, startCol, currentRow + 1, endCol);
      }

      const lc = labelRow.getCell(startCol);
      lc.value = card.label.toUpperCase();
      lc.font = { name: 'Calibri', size: 8.5, bold: true, color: { argb: fg } };
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      lc.alignment = { vertical: 'bottom', horizontal: 'center' };

      const vc = valRow.getCell(startCol);
      vc.value = card.value;
      vc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: fg } };
      vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      vc.alignment = { vertical: 'top', horizontal: 'center' };

      for (let cc = startCol; cc <= endCol; cc++) {
        labelRow.getCell(cc).border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: cc === startCol ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
          right: cc === endCol ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined
        };
        valRow.getCell(cc).border = {
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: cc === startCol ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined,
          right: cc === endCol ? { style: 'thin', color: { argb: 'FFCBD5E1' } } : undefined
        };
      }
    }
    currentRow += 2;
  }

  // Blank spacer before table header
  const tableSpacer = ws.addRow([]);
  tableSpacer.height = 8;
  currentRow++;

  // 5. TABLE HEADER ROW (FROZEN + AUTOFILTER)
  const headerRowIdx = currentRow;
  const headerRow = ws.addRow(headers);
  headerRow.height = 28;
  for (let c = 1; c <= headers.length; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: HEADER_ACCENT_BOTTOM
    };
  }

  // Freeze everything up to table header & enable Excel AutoFilter
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: true }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: headers.length }
  };

  // Track max text width per column for crisp auto-fit
  const maxLengths = headers.map((h) => Math.max(6, h.length + 3));

  // 6. DATA ROWS WITH ZEBRA STRIPING & CONDITIONAL PILL STYLING
  rows.forEach((rowValues, rIdx) => {
    const isEven = rIdx % 2 === 1;
    const defaultZebraFill = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    const sanitizedValues = rowValues.map((val, cIdx) => {
      const meta = columnMeta[cIdx];
      if (meta?.isTextId) {
        return val === undefined || val === null ? '' : String(val).replace(/^'/, '');
      }
      if (meta?.isPercent && typeof val === 'string' && val.endsWith('%')) {
        const parsed = parseFloat(val.replace('%', ''));
        if (!isNaN(parsed)) return parsed / 100;
      }
      return val;
    });

    const excelRow = ws.addRow(sanitizedValues);
    // Estimate height cleanly when text wraps
    let maxLines = 1;

    sanitizedValues.forEach((val, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const meta = columnMeta[cIdx];
      const override = cellStyler ? cellStyler(rIdx, cIdx, val, sanitizedValues) : undefined;

      const textLen = meta?.isPercent && typeof val === 'number'
        ? 6
        : String(val ?? '').length;
      if (textLen + 3 > maxLengths[cIdx]) {
        maxLengths[cIdx] = textLen + 3;
      }

      const align = override?.align || meta?.align || (meta?.isNumeric || meta?.isPercent ? 'center' : 'left');
      const wrap = Boolean(meta?.wrapText);

      if (wrap && meta?.maxWidth && textLen > meta.maxWidth) {
        maxLines = Math.max(maxLines, Math.min(3, Math.ceil(textLen / (meta.maxWidth - 2))));
      }

      if (meta?.isTextId) {
        cell.numFmt = '@';
      } else if (meta?.isPercent && typeof val === 'number') {
        cell.numFmt = '0%';
      } else if (meta?.isNumeric && typeof val === 'number') {
        cell.numFmt = '#,##0';
      }

      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: override?.bold ?? false,
        color: { argb: override?.fontHex || 'FF1E293B' }
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: override?.fillHex || defaultZebraFill }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: align,
        wrapText: wrap
      };
      cell.border = {
        top: THIN_SLATE_BORDER,
        left: THIN_SLATE_BORDER,
        right: THIN_SLATE_BORDER,
        bottom: THIN_SLATE_BORDER
      };
    });

    excelRow.height = Math.max(20, maxLines * 15 + 4);
  });

  // 7. OPTIONAL GRAND TOTAL / SUMMARY ROW
  if (totalRow && totalRow.length > 0) {
    const sanitizedTotal = totalRow.map((val, cIdx) => {
      const meta = columnMeta[cIdx];
      if (meta?.isPercent && typeof val === 'string' && val.endsWith('%')) {
        const parsed = parseFloat(val.replace('%', ''));
        if (!isNaN(parsed)) return parsed / 100;
      }
      return val;
    });
    const tRow = ws.addRow(sanitizedTotal);
    tRow.height = 24;
    sanitizedTotal.forEach((val, cIdx) => {
      const cell = tRow.getCell(cIdx + 1);
      const meta = columnMeta[cIdx];
      if (meta?.isPercent && typeof val === 'number') {
        cell.numFmt = '0%';
      } else if (meta?.isNumeric && typeof val === 'number') {
        cell.numFmt = '#,##0';
      }
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: meta?.align || (meta?.isNumeric || meta?.isPercent ? 'center' : 'left')
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1E3A8A' } },
        bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
        left: THIN_SLATE_BORDER,
        right: THIN_SLATE_BORDER
      };
    });
  }

  // 8. AUTO-FIT COLUMN WIDTHS RESPECTING MIN/MAX CONSTRAINTS
  for (let c = 0; c < headers.length; c++) {
    const meta = columnMeta[c];
    const col = ws.getColumn(c + 1);
    if (meta?.width) {
      col.width = meta.width;
    } else {
      const minW = meta?.minWidth ?? 8;
      const maxW = meta?.maxWidth ?? 38;
      col.width = Math.max(minW, Math.min(maxW, maxLengths[c]));
    }
  }

  // 9. OPTIONAL COLOR LEGEND STRIP
  if (legendItems.length > 0) {
    ws.addRow([]).height = 8;
    const legRow = ws.addRow(['KETERANGAN STATUS:', ...legendItems.map((l) => `${l.code} = ${l.label}`)]);
    legRow.height = 20;
    legRow.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
    legRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    legendItems.forEach((item, i) => {
      const c = legRow.getCell(i + 2);
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: item.fontHex } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.fillHex } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
      c.border = {
        top: THIN_SLATE_BORDER,
        left: THIN_SLATE_BORDER,
        right: THIN_SLATE_BORDER,
        bottom: THIN_SLATE_BORDER
      };
    });
  }

  // 10. OFFICIAL SIGNATURE FOOTER BLOCK
  ws.addRow([]).height = 12;
  const leftEndCol = Math.max(2, Math.floor(totalCols / 3));
  const rightStartCol = Math.max(leftEndCol + 2, totalCols - 2);

  const sigTitleRow = ws.addRow([]);
  sigTitleRow.height = 18;
  sigTitleRow.getCell(1).value = signatureLeftLabel;
  sigTitleRow.getCell(1).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };
  sigTitleRow.getCell(rightStartCol).value = signatureRightLabel;
  sigTitleRow.getCell(rightStartCol).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF475569' } };

  // Signature spacing rows
  ws.addRow([]).height = 18;
  ws.addRow([]).height = 18;

  const sigNameRow = ws.addRow([]);
  sigNameRow.height = 18;
  sigNameRow.getCell(1).value = signatureLeftName;
  sigNameRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, underline: true, color: { argb: 'FF0F172A' } };
  sigNameRow.getCell(rightStartCol).value = signatureRightName;
  sigNameRow.getCell(rightStartCol).font = { name: 'Calibri', size: 10, bold: true, underline: true, color: { argb: 'FF0F172A' } };

  // Print timestamp footer
  const tsRow = ws.addRow([`Dicetak otomatis oleh Sistem Presensi Digital DIGIWANGI 3 • SDN 3 Karamatwangi • ${new Date().toLocaleString('id-ID')}`]);
  tsRow.height = 16;
  tsRow.getCell(1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF94A3B8' } };

  return ws;
}
