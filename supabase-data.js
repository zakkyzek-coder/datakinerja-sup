/**
 * DataKinerja — Supabase data adapter (migration phase 1)
 *
 * Replace the GAS getDataBundle() transport while keeping the existing dashboard
 * renderer contract. This file does not modify the UI or business calculations.
 *
 * Usage:
 *   import { createDataKinerjaService } from './supabase-data.js';
 *   const dataService = createDataKinerjaService(supabase);
 *   const result = await dataService.getDataBundle(['Aset 1', 'DPK 1'], false);
 *
 * Never put a Supabase service_role key in browser code.
 */

const PAGE_SIZE = 1000;
const DEFAULT_DAILY_START_MONTH = '2026-11';

function normName(value) {
  return String(value ?? '').toLowerCase().replace(/[\s_]+/g, '').trim();
}

function parseRequest(requestName) {
  const raw = String(requestName ?? '');
  const split = raw.split('|');
  return {
    requestedName: raw,
    sheetName: (split[0] ?? '').trim(),
    valueColumn: split.length > 1 ? split.slice(1).join('|').trim() : ''
  };
}

function formatUpdateDate(dateValue, timeZone = 'Asia/Makassar') {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone, day: 'numeric', month: 'short', year: 'numeric'
  }).format(d).replace(/\./g, '');
}

function todayInTimeZone(timeZone = 'Asia/Makassar') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function mapDbRow(row, source) {
  const isAo = source.source_kind === 'ao';
  return {
    p: row.period_key ?? '',
    d: row.source_date ?? '',
    m: row.period_month ? String(row.period_month).slice(0, 7) : String(row.period_key ?? '').slice(0, 7),
    daily: Boolean(row.is_daily),
    seg: isAo ? (row.segment ?? '') : undefined,
    q: isAo ? (row.quarter_number ?? null) : undefined,
    u: row.entity_name ?? '',
    k: isAo ? '' : (row.group_name ?? ''),
    c: isAo ? (row.office_name ?? '') : undefined,
    v: row.actual ?? null,
    t: row.target ?? null,
    yoy: row.yoy ?? null,
    ytd: row.ytd ?? null,
    mtm: row.mtm ?? null,
    rbb: row.achievement ?? null
  };
}

export function createDataKinerjaService(supabase, options = {}) {
  if (!supabase?.from) throw new Error('Supabase client belum diberikan.');
  const tableData = options.tableData ?? 'bks_data';
  const tableSources = options.tableSources ?? 'bks_sumber';
  const tableSettings = options.tableSettings ?? 'bks_pengaturan';
  const timezone = options.timezone ?? 'Asia/Makassar';
  const dailyStartMonth = options.dailyStartMonth ?? DEFAULT_DAILY_START_MONTH;

  async function readAllRows(sourceKeys) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(tableData)
        .select('source_key,period_key,period_month,source_date,is_daily,entity_name,group_name,office_name,segment,quarter_number,actual,target,yoy,ytd,mtm,achievement')
        .in('source_key', sourceKeys)
        .order('period_key', { ascending: true })
        .range(from, to);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  async function getDataBundle(sheetNames, force = false) {
    // "force" is kept to match the old GAS function signature; caching is added
    // during the frontend integration phase.
    void force;
    try {
      const requested = [...new Set((sheetNames ?? []).map(x => String(x)))];
      if (!requested.length) {
        return {
          success: true, sheets: {}, missing: [],
          settings: { dailyStartMonth, today: todayInTimeZone(timezone) },
          updateData: '', lastUpdated: new Date().toLocaleString('id-ID', { timeZone: timezone })
        };
      }

      const parsed = requested.map(parseRequest);
      const { data: sourceRows, error: sourceError } = await supabase
        .from(tableSources)
        .select('source_key,sheet_name,value_column,source_kind,enabled')
        .eq('enabled', true);
      if (sourceError) throw sourceError;

      const sourceForRequest = new Map();
      const missing = [];
      for (const req of parsed) {
        const source = (sourceRows ?? []).find(s =>
          normName(s.sheet_name) === normName(req.sheetName) &&
          (!req.valueColumn || normName(s.value_column) === normName(req.valueColumn))
        );
        if (!source) {
          missing.push(req.requestedName);
          continue;
        }
        sourceForRequest.set(req.requestedName, source);
      }

      const sourceKeys = [...new Set([...sourceForRequest.values()].map(s => s.source_key))];
      const dbRows = sourceKeys.length ? await readAllRows(sourceKeys) : [];
      const bySource = new Map();
      for (const row of dbRows) {
        if (!bySource.has(row.source_key)) bySource.set(row.source_key, []);
        bySource.get(row.source_key).push(row);
      }

      const sheets = {};
      for (const req of parsed) {
        const source = sourceForRequest.get(req.requestedName);
        if (!source) continue;
        sheets[req.requestedName] = (bySource.get(source.source_key) ?? [])
          .map(row => mapDbRow(row, source));
      }

      const dates = dbRows.map(r => r.source_date).filter(Boolean).sort();
      const newestDate = dates.length ? dates[dates.length - 1] : '';
      const { data: settingRows, error: settingError } = await supabase
        .from(tableSettings)
        .select('key,value')
        .in('key', ['daily_start_month', 'timezone']);
      const settingMap = settingError ? {} : Object.fromEntries((settingRows ?? []).map(r => [r.key, r.value]));
      const resolvedTz = settingMap.timezone || timezone;
      const resolvedStart = settingMap.daily_start_month || dailyStartMonth;

      return {
        success: true,
        sheets,
        missing,
        settings: { dailyStartMonth: resolvedStart, today: todayInTimeZone(resolvedTz) },
        updateData: formatUpdateDate(newestDate, resolvedTz),
        lastUpdated: new Date().toLocaleString('id-ID', { timeZone: resolvedTz })
      };
    } catch (error) {
      return { success: false, message: error?.message || String(error), sheets: {}, missing: [] };
    }
  }

  return { getDataBundle };
}
