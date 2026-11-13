# DataKinerja — Supabase migration

Repository for the gradual migration of DataKinerja from Google Apps Script + Google Sheets to Supabase + GitHub Pages.

## Current status

**Phase 1: Supabase data adapter committed.** The existing dashboard UI, chart renderers, formulas, filters, and GAS app remain unchanged.

Files:
- `supabase-data.js`: reads configured sources from `bks_sumber`, reads rows from `bks_data`, and maps records to a GAS-compatible response shape.

## Adapter contract

The adapter returns:
```js
{
  success: true,
  sheets: { /* requested source name: normalized rows[] */ },
  missing: [],
  settings: { dailyStartMonth: '2026-11', today: 'YYYY-MM-DD' },
  updateData: '',
  lastUpdated: ''
}
```

It maps database rows to legacy property names `p,d,m,daily,seg,q,u,k,c,v,t,yoy,ytd,mtm,rbb` so the renderer can be migrated separately.

## Supabase configuration

Project URL for this app:
`https://qrdmphbpqgsymfzxgija.supabase.co`

Create the client in an ES module, then import the adapter. **Use only the publishable/anon key in browser code; never put a service_role key in this repository.**

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createDataKinerjaService } from './supabase-data.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const dataService = createDataKinerjaService(supabase);
const result = await dataService.getDataBundle(['Aset 1', 'DPK 1']);
console.log(result);
```

The user authentication flow and RLS must be configured before the browser can access protected data.

## Important implementation limits

- This adapter is a transport layer only. It does **not** yet integrate with the existing dashboard frontend.
- Source rows currently configured in `bks_sumber` are limited to Aset 1, DPK 1, Eks FLPP 1, NOA Eks FLPP 1, Pby 1, and Peringkat AO. Other requested sheets will be reported in `missing` until they are registered correctly.
- `force` is accepted for compatibility with the legacy function signature; adapter caching is not implemented yet.
- `updateData` is currently derived from the newest readable `source_date`, not the legacy `Update Data!B1` cell.
- Before switching users from GAS, integrate auth and this adapter into `muatData()`, then compare representative periods/units against GAS.

## GitHub Pages

Once the frontend and Supabase authentication are integrated, enable GitHub Pages in repository Settings → Pages. Do not publish credentials or Supabase service-role keys.
