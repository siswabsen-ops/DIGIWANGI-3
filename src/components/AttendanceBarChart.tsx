import React, { useState, useMemo, memo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  ReferenceLine
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Award,
  Layers,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Users
} from 'lucide-react';
import { Siswa, Presensi, DAFTAR_KELAS } from '../types';
import {
  calculateAllRombelSummaryList,
  calculateSchoolAttendanceStats,
  normalizeDateKey,
  getLocalDateString,
  isPresensiDateMatch,
  isSameClass
} from '../lib/attendanceUtils';

interface AttendanceBarChartProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
  selectedDate?: string;
  selectedKelas?: string;
  onSelectKelas?: (kelas: string) => void;
}

type ChartMode = 'rombel' | 'trend7days' | 'keaktifan';

function AttendanceBarChart({
  siswaList,
  presensiList,
  selectedDate,
  selectedKelas = 'Semua Kelas',
  onSelectKelas
}: AttendanceBarChartProps) {
  const activeDate = selectedDate || getLocalDateString();
  const [chartMode, setChartMode] = useState<ChartMode>('rombel');
  const [showStacked, setShowStacked] = useState<boolean>(true);

  // 1. DATA: Rekapitulasi Per Rombel Kelas pada tanggal terpilih
  const rombelData = useMemo(() => {
    const summaries = calculateAllRombelSummaryList(siswaList, presensiList, activeDate);
    return summaries.map(r => ({
      name: r.kelas.replace('Kelas ', ''),
      fullKelas: r.kelas,
      waliKelas: r.waliKelas,
      totalSiswa: r.totalSiswa,
      hadir: r.hadir,
      terlambat: r.terlambat,
      sakit: r.sakit,
      izin: r.izin,
      alfa: r.alfa,
      belumAbsen: r.belumAbsen,
      totalMasuk: r.totalHadir,
      totalTidakHadir: r.totalTidakHadir,
      persentase: r.persentase,
    }));
  }, [siswaList, presensiList, activeDate]);

  // 2. DATA: Tren Harian 7 Hari Terakhir
  const trend7DaysData = useMemo(() => {
    const data: {
      dateStr: string;
      label: string;
      shortDay: string;
      fullDateFormatted: string;
      totalSiswa: number;
      hadir: number;
      terlambat: number;
      sakit: number;
      izin: number;
      alfa: number;
      belumAbsen: number;
      totalMasuk: number;
      persentase: number;
    }[] = [];

    const baseDate = new Date(activeDate);
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    // Generate last 7 days ending at activeDate
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const dateStr = new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
      
      const dayIndex = d.getDay();
      const shortDay = dayNames[dayIndex].substring(0, 3);
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString('id-ID', { month: 'short' });
      const label = `${shortDay}, ${dayNum} ${monthShort}`;
      const fullDateFormatted = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      const stats = calculateSchoolAttendanceStats(siswaList, presensiList, dateStr, selectedKelas);
      const totalSiswa = stats.totalSiswa;
      const hadir = stats.hadir;
      const terlambat = stats.terlambat;
      const sakit = stats.sakit;
      const izin = stats.izin;
      const alfa = stats.alfa;
      const belumAbsen = stats.belumAbsen;
      const totalMasuk = hadir + terlambat;
      const persentase = stats.persentaseKeaktifan;

      data.push({
        dateStr,
        label,
        shortDay,
        fullDateFormatted,
        totalSiswa,
        hadir,
        terlambat,
        sakit,
        izin,
        alfa,
        belumAbsen,
        totalMasuk,
        persentase
      });
    }

    return data;
  }, [siswaList, presensiList, activeDate, selectedKelas]);

  // 3. DATA: Ranking Keaktifan Rombel (Diurutkan dari % Tertinggi)
  const rankingKeaktifanData = useMemo(() => {
    return [...rombelData].sort((a, b) => b.persentase - a.persentase);
  }, [rombelData]);

  // Summary Metrics
  const summaryHighlight = useMemo(() => {
    const totalSiswa = rombelData.reduce((acc, curr) => acc + curr.totalSiswa, 0);
    const totalMasuk = rombelData.reduce((acc, curr) => acc + curr.totalMasuk, 0);
    const avgPersen = totalSiswa > 0 ? Math.round((totalMasuk / totalSiswa) * 100) : 0;
    
    // Find best class
    const bestClass = [...rombelData].sort((a, b) => b.persentase - a.persentase)[0];

    return {
      totalSiswa,
      totalMasuk,
      avgPersen,
      bestClass: bestClass ? `${bestClass.fullKelas} (${bestClass.persentase}%)` : '-'
    };
  }, [rombelData]);

  // Custom Tooltip for Rombel Breakdown
  const CustomRombelTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs min-w-[200px] text-slate-800 space-y-2 z-50">
          <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <div>
              <p className="font-black text-slate-900 text-sm">{data.fullKelas}</p>
              <p className="text-[10px] text-slate-500">Wali: {data.waliKelas}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              data.persentase >= 90 ? 'bg-emerald-100 text-emerald-800' : data.persentase >= 75 ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {data.persentase}% Keaktifan
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Hadir:
              </span>
              <span className="font-bold">{data.hadir}</span>
            </div>
            <div className="flex items-center justify-between text-amber-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                Telat:
              </span>
              <span className="font-bold">{data.terlambat}</span>
            </div>
            <div className="flex items-center justify-between text-indigo-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                Sakit:
              </span>
              <span className="font-bold">{data.sakit}</span>
            </div>
            <div className="flex items-center justify-between text-sky-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>
                Izin:
              </span>
              <span className="font-bold">{data.izin}</span>
            </div>
            <div className="flex items-center justify-between text-rose-700">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                Alfa:
              </span>
              <span className="font-bold">{data.alfa}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                Belum:
              </span>
              <span className="font-bold">{data.belumAbsen}</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-bold text-[11px]">
            <span className="text-slate-600">Total Masuk / Murid:</span>
            <span className="text-blue-700">{data.totalMasuk} / {data.totalSiswa} Siswa</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for 7 Days Trend
  const CustomTrendTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs min-w-[210px] text-slate-800 space-y-2 z-50">
          <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
            <div>
              <p className="font-black text-slate-900 text-xs">{data.fullDateFormatted}</p>
              <p className="text-[10px] text-slate-500">{selectedKelas}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
              {data.persentase}% Partisipasi
            </span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between text-emerald-700 font-bold">
              <span>Hadir Masuk (Tepat + Telat):</span>
              <span>{data.totalMasuk} Siswa</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[10px]">
              <span>• Hadir Tepat Waktu:</span>
              <span>{data.hadir}</span>
            </div>
            <div className="flex items-center justify-between text-amber-700 text-[10px]">
              <span>• Terlambat Hadir:</span>
              <span>{data.terlambat}</span>
            </div>
            <div className="flex items-center justify-between text-rose-600 text-[10px]">
              <span>• Sakit / Izin / Alfa:</span>
              <span>{data.sakit + data.izin + data.alfa} Siswa</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-bold text-[11px]">
            <span className="text-slate-600">Total Basis Murid:</span>
            <span className="text-slate-900">{data.totalSiswa} Siswa</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm space-y-4 text-left">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-600 text-white rounded-xl shadow-xs">
              <BarChart3 className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-black text-slate-800 tracking-tight">
              Grafik Analitik Kehadiran Siswa
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
            Visualisasi tingkat partisipasi dan sebaran status kehadiran siswa SDN 3 Karamatwangi
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setChartMode('rombel')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              chartMode === 'rombel'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Per Rombel (1-A s/d 6-B)
          </button>
          <button
            type="button"
            onClick={() => setChartMode('trend7days')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              chartMode === 'trend7days'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tren 7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => setChartMode('keaktifan')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              chartMode === 'keaktifan'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Peringkat % Keaktifan
          </button>
        </div>
      </div>

      {/* Mini Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-2.5 flex items-center gap-2.5">
          <span className="p-2 bg-blue-600 text-white rounded-xl">
            <Users className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className="text-[10px] text-blue-800 font-bold uppercase block">Total Kehadiran</span>
            <p className="text-sm font-black text-blue-950">{summaryHighlight.totalMasuk} / {summaryHighlight.totalSiswa} Siswa</p>
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-2.5 flex items-center gap-2.5">
          <span className="p-2 bg-emerald-600 text-white rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className="text-[10px] text-emerald-800 font-bold uppercase block">Rata-Rata Keaktifan</span>
            <p className="text-sm font-black text-emerald-950">{summaryHighlight.avgPersen}%</p>
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-100 rounded-2xl p-2.5 flex items-center gap-2.5">
          <span className="p-2 bg-amber-500 text-white rounded-xl">
            <Award className="w-3.5 h-3.5" />
          </span>
          <div className="truncate">
            <span className="text-[10px] text-amber-800 font-bold uppercase block">Rombel Terbaik</span>
            <p className="text-xs font-black text-amber-950 truncate">{summaryHighlight.bestClass}</p>
          </div>
        </div>

        <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-2.5 flex items-center gap-2.5">
          <span className="p-2 bg-indigo-600 text-white rounded-xl">
            <Calendar className="w-3.5 h-3.5" />
          </span>
          <div className="truncate">
            <span className="text-[10px] text-indigo-800 font-bold uppercase block">Tanggal Pantau</span>
            <p className="text-xs font-black text-indigo-950 truncate">
              {new Date(activeDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="w-full h-[320px] pt-2">
        {/* VIEW 1: ROMBEL STACKED BAR CHART */}
        {chartMode === 'rombel' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rombelData}
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
              onClick={(data: any) => {
                if (data && data.activePayload && data.activePayload.length && onSelectKelas) {
                  onSelectKelas(data.activePayload[0].payload.fullKelas);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomRombelTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '10px', fontWeight: 'bold' }}
              />
              <Bar dataKey="hadir" name="Hadir Tepat" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="terlambat" name="Terlambat" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="sakit" name="Sakit" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="izin" name="Izin" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
              <Bar dataKey="alfa" name="Alfa" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="belumAbsen" name="Belum Presensi" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* VIEW 2: 7 DAYS TREND BAR CHART */}
        {chartMode === 'trend7days' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trend7DaysData}
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTrendTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '10px', fontWeight: 'bold' }}
              />
              <Bar dataKey="hadir" name="Hadir Tepat" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="terlambat" name="Terlambat" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="sakit" name="Sakit" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="izin" name="Izin" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
              <Bar dataKey="alfa" name="Alfa" stackId="a" fill="#f43f5e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="belumAbsen" name="Belum Presensi" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* VIEW 3: RANKING % KEAKTIFAN */}
        {chartMode === 'keaktifan' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rankingKeaktifanData}
              margin={{ top: 10, right: 15, left: -20, bottom: 20 }}
              onClick={(data: any) => {
                if (data && data.activePayload && data.activePayload.length && onSelectKelas) {
                  onSelectKelas(data.activePayload[0].payload.fullKelas);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }}
                unit="%"
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Target 90%', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} />
              <Tooltip
                formatter={(value: any) => [`${value}% Keaktifan`, 'Tingkat Partisipasi']}
                labelFormatter={(label: any) => `Kelas ${label}`}
              />
              <Bar dataKey="persentase" name="% Keaktifan Kehadiran" radius={[6, 6, 0, 0]}>
                {rankingKeaktifanData.map((entry, index) => {
                  let fillColor = '#3b82f6';
                  if (entry.persentase >= 90) fillColor = '#10b981';
                  else if (entry.persentase < 70) fillColor = '#f43f5e';
                  else if (entry.persentase < 85) fillColor = '#f59e0b';
                  return <Cell key={`cell-${index}`} fill={fillColor} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-600 font-bold">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Tips: Klik batang pada grafik untuk menyaring data siswa kelas tersebut.
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-medium">
          Dihitung real-time dari {siswaList.length} siswa terdaftar
        </div>
      </div>
    </div>
  );
}

export default memo(AttendanceBarChart);
