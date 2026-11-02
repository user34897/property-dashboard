/* data.js — reads the Excel file and tidies up the data.
   Everything here runs inside the browser; nothing is sent anywhere.

   Two steps:
   1. readWorkbook(): pull the raw rows out of the spreadsheet (this is what gets remembered on the device).
   2. process():      tidy the rows, work out derived values ourselves (days on market, $/m², etc.)
                      and note any data problems for the Data Check tab. */
(function () {
  'use strict';

  // The columns we look for, matched by heading name (not by position).
  // "names" are the headings we accept; "usedFor" is shown if the column is missing.
  const COLUMNS = {
    no:          { label: 'No',                names: ['No', 'Number', 'Ref', 'ID'],                                  usedFor: 'property numbers in the Data Check' },
    suburb:      { label: 'Suburb',            names: ['Suburb'],                                                     usedFor: 'everything (only rows with a suburb are counted)', required: true },
    status:      { label: 'Status',            names: ['Status'],                                                     usedFor: 'how properties sold (at auction, before auction or privately)' },
    outcome:     { label: 'Outcome',           names: ['Outcome', 'SaleOutcome'],                                     usedFor: 'the sale outcome filter and breakdown' },
    area:        { label: 'AreaSqM',           names: ['AreaSqM', 'Area', 'LandSize', 'LandSizeSqM', 'LandArea'],     usedFor: 'land size and $/m²' },
    listingDate: { label: 'ListingDate',       names: ['ListingDate', 'ListedDate', 'DateListed'],                    usedFor: 'days on market' },
    auctionDate: { label: 'AuctionDate',       names: ['AuctionDate'],                                                usedFor: 'auction dates in the property list' },
    soldDate:    { label: 'SoldDate',          names: ['SoldDate', 'DateSold', 'SaleDate'],                           usedFor: 'monthly charts, the date filter and days on market' },
    priceHigh:   { label: 'PriceHighBand',     names: ['PriceHighBand', 'PriceGuideHigh', 'HighBand'],                usedFor: 'comparing sold prices with the price guide' },
    predicted:   { label: 'MyPredictedPrice',  names: ['MyPredictedPrice', 'PredictedPrice', 'MyPrediction'],         usedFor: 'the My Predictions tab' },
    reserve:     { label: 'FinalReservePrice', names: ['FinalReservePrice', 'ReservePrice'],                          usedFor: 'reserve prices in the property list' },
    sold:        { label: 'ActualSoldPrice',   names: ['ActualSoldPrice', 'SoldPrice', 'SalePrice'],                  usedFor: 'all sold prices' },
    company:     { label: 'SellingCompany',    names: ['SellingCompany', 'Agency', 'Company'],                        usedFor: 'agency comparisons' },
    agent:       { label: 'SellingAgent',      names: ['SellingAgent', 'Agent', 'Agents'],                            usedFor: 'top agents' },
    address:     { label: 'Address',           names: ['Address'],                                                    usedFor: 'showing which property is which' },
    link:        { label: 'Link',              names: ['Link', 'URL', 'ListingLink'],                                 usedFor: 'listing links' }
  };

  // Known misspellings of suburb names → correct spelling.
  const SUBURB_FIXES = { scorsbey: 'Scoresby' };

  // Rules for "impossible or suspicious" values that are left out of averages.
  const MAX_ERROR = 1.0;          // prediction or price guide more than 100% away from the sold price
  const LOW_PRICE = 100000;       // a sold price under this is probably a typo
  const SMALL_LAND = 50, BIG_LAND = 3000;

  // Every kind of data problem we look for. sev = how it's treated.
  const ISSUE_TYPES = {
    negDom:        { sev: 'excluded', title: 'Sold date is before the listing date', help: 'Days on market would be negative, so this property is left out of days-on-market averages.' },
    noArea:        { sev: 'excluded', title: 'Missing or zero land size', help: 'Land size is blank or 0, so $/m² can’t be worked out. Left out of $/m² averages and the land size filter.' },
    predOutlier:   { sev: 'excluded', title: 'Prediction is more than 100% away from the sold price', help: 'Probably a typo (for example a missing digit). Left out of all prediction accuracy figures.' },
    guideOutlier:  { sev: 'excluded', title: 'Price guide is more than 100% away from the sold price', help: 'Probably a typo (for example $120,000 instead of $1,200,000). Left out of price guide comparisons.' },
    suburbSpelling:{ sev: 'fixed',    title: 'Suburb spelling corrected', help: 'Counted under the correct suburb. You may want to fix the spelling in Excel too.' },
    soldNoPrice:   { sev: 'check',    title: 'Looks sold, but has no sold price', help: 'It has a sold date or a “sold” status, but ActualSoldPrice is blank, so it is not counted as sold.' },
    priceNoDate:   { sev: 'check',    title: 'Has a sold price but no sold date', help: 'Counted as sold, but left out of monthly charts, the date filter and days on market.' },
    listedWithPrice:{ sev: 'check',   title: 'Sold price recorded, but Status not updated', help: 'The Status still says it isn’t sold, but there’s a sold price, so it is counted as sold. The details show which category it was put in. Please update the Status in Excel.' },
    unknownStatus: { sev: 'check',    title: 'Status not recognised', help: 'This Status isn’t one of the usual ones, so the property is left out of the how-it-sold breakdown.' },
    statusMismatch:{ sev: 'check',    title: 'Status and Outcome don’t agree', help: 'The Status column and the Outcome column say different things. The Outcome is used for the outcome filter.' },
    duplicate:     { sev: 'check',    title: 'Same address appears more than once', help: 'Could be a duplicate row, or the same house sold twice. Both rows are counted.' },
    lowPrice:      { sev: 'check',    title: 'Sold price looks too low', help: `Under ${F.money(LOW_PRICE)}. Still counted, but probably a typo.` },
    unusualArea:   { sev: 'check',    title: 'Unusual land size', help: `Under ${SMALL_LAND} m² or over ${F.num(BIG_LAND)} m². Still counted, but worth a check.` },
    futureDate:    { sev: 'check',    title: 'Sold date is in the future', help: 'Still counted, but probably a typo.' },
    badDate:       { sev: 'check',    title: 'Date couldn’t be read', help: 'This cell doesn’t look like a date, so it was ignored.' },
    badLink:       { sev: 'check',    title: 'Listing link isn’t a web address', help: 'Links need to start with http:// or https:// to open.' },
    noListingDate: { sev: 'info',     title: 'Sold, but no listing date', help: 'Days on market can’t be worked out for these properties.' },
    noCompany:     { sev: 'info',     title: 'No selling company', help: 'Shown as “Unknown agency”.' }
  };

  class UserError extends Error {}

  // ---------- small helpers ----------
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanText = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
  };
  const lowerKey = (s) => s.toLowerCase();

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const s = v.replace(/[$,\s]/g, '');
      if (s === '') return null;
      const n = Number(s);
      return isFinite(n) ? n : null;
    }
    return null;
  }

  /** Turns an Excel date (a day number) or typed date text into "milliseconds at midnight UTC". */
  function toDate(v, date1904) {
    if (v == null || v === '') return { ms: null };
    if (typeof v === 'number') {
      if (v < 1) return { ms: null };                 // Excel shows a blank date as 0 (= 1900)
      const days = Math.floor(v) + (date1904 ? 1462 : 0);
      return { ms: (days - 25569) * F.DAY };         // 25569 = days from 1900 to 1970
    }
    const s = String(v).trim();
    if (!s) return { ms: null };
    let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);   // Australian style 14/10/2025
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      const ms = Date.UTC(y, Number(m[2]) - 1, Number(m[1]));
      if (!isNaN(ms)) return { ms };
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                        // 2025-10-14
    if (m) return { ms: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) };
    return { ms: null, bad: true };
  }

  /**
   * Spellings that differ only in capitals or spacing are treated as the same thing.
   * The spelling used most often wins.
   */
  function makeCanon(values, keyFn) {
    const groups = new Map();
    values.forEach((v) => {
      if (!v) return;
      const k = keyFn(v);
      if (!groups.has(k)) groups.set(k, new Map());
      const g = groups.get(k);
      g.set(v, (g.get(v) || 0) + 1);
    });
    const chosen = new Map();
    const merged = [];
    groups.forEach((g, k) => {
      let best = null, n = -1;
      g.forEach((c, v) => { if (c > n) { best = v; n = c; } });
      chosen.set(k, best);
      if (g.size > 1) merged.push({ to: best, from: [...g.keys()].filter((v) => v !== best), count: [...g.values()].reduce((a, b) => a + b, 0) });
    });
    return { get: (v) => (v ? chosen.get(keyFn(v)) : null), merged };
  }

  // ---------- step 1: read the spreadsheet ----------

  function sheetRows(ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  }

  function findHeaderRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      if ((rows[i] || []).some((c) => norm(c) === 'suburb')) return i;
    }
    return -1;
  }

  /** Reads the CompanyMap sheet (if there is one) that tidies agency names. */
  function readCompanyMap(wb) {
    const name = wb.SheetNames.find((n) => norm(n) === 'companymap');
    if (!name) return null;
    const rows = sheetRows(wb.Sheets[name]);
    let h = rows.findIndex((r) => (r || []).some((c) => norm(c) === 'rawname'));
    let rawCol = 0, cleanCol = 1;
    if (h >= 0) {
      rawCol = rows[h].findIndex((c) => norm(c) === 'rawname');
      const cc = rows[h].findIndex((c) => norm(c) === 'cleanname');
      cleanCol = cc >= 0 ? cc : rawCol + 1;
    }
    const map = {};
    rows.slice(h + 1).forEach((r) => {
      const raw = cleanText(r[rawCol]), clean = cleanText(r[cleanCol]);
      if (raw && clean) map[raw] = clean;
    });
    return Object.keys(map).length ? { sheet: name, map } : null;
  }

  function readWorkbook(buffer, fileName) {
    if (typeof XLSX === 'undefined') {
      throw new UserError('The Excel reader didn’t load. Please check the internet connection and refresh the page.');
    }
    let wb;
    try {
      wb = XLSX.read(buffer, { type: 'array', cellDates: false, cellHTML: false, cellStyles: false });
    } catch (e) {
      throw new UserError('This file couldn’t be opened. Please choose an Excel file (.xlsx).');
    }

    // Prefer the "RawData" sheet; otherwise the first sheet that has a "Suburb" heading.
    const order = [...wb.SheetNames].sort((a, b) => (norm(b) === 'rawdata') - (norm(a) === 'rawdata'));
    let sheetName = null, rows = null, headerIdx = -1;
    for (const name of order) {
      const r = sheetRows(wb.Sheets[name]);
      const h = findHeaderRow(r);
      if (h >= 0) { sheetName = name; rows = r; headerIdx = h; break; }
    }
    if (!sheetName) {
      throw new UserError('Couldn’t find the sales data. The spreadsheet needs a sheet with a column headed “Suburb” (normally the “RawData” sheet).');
    }

    // Match headings to the columns we know about.
    const headers = rows[headerIdx].map((c) => (c == null ? '' : String(c).trim()));
    const colIndex = {};
    Object.entries(COLUMNS).forEach(([key, def]) => {
      const wanted = def.names.map(norm);
      const i = headers.findIndex((h) => wanted.includes(norm(h)));
      if (i >= 0) colIndex[key] = i;
    });

    const data = [];
    let blankRows = 0;
    rows.slice(headerIdx + 1).forEach((r) => {
      if (!cleanText(r[colIndex.suburb])) { blankRows++; return; }   // only rows with a Suburb are real
      const rec = {};
      Object.entries(colIndex).forEach(([key, i]) => { rec[key] = r[i] == null ? null : r[i]; });
      data.push(rec);
    });

    return {
      version: 1,
      fileName,
      loadedAt: Date.now(),
      sheetName,
      columns: Object.fromEntries(Object.entries(colIndex).map(([k, i]) => [k, headers[i]])),
      date1904: !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904),
      companyMap: readCompanyMap(wb),
      blankRows,
      rows: data
    };
  }

  // ---------- step 2: tidy up and work things out ----------

  // Sorts a Status or Outcome into a simple group so the two can be compared.
  function statusGroup(s) {
    if (!s) return null;
    const t = s.toLowerCase();
    if (t.includes('currently listed') || t.includes('on private sale now')) return 'listed';
    if (t.includes('sold before auction')) return 'before';
    if (t.includes('sold in auction') || t.includes('sold at auction')) return 'auction';
    if (t.includes('sold in private') || t === 'private sale') return 'private';
    return null;
  }
  function outcomeGroup(o) {
    if (!o) return null;
    const t = o.toLowerCase();
    if (t.includes('listed')) return 'listed';
    if (t.includes('before')) return 'before';
    if (t.includes('auction')) return 'auction';
    if (t.includes('private')) return 'private';
    return null;
  }
  // How the property sold, from the Status column (capital letters ignored):
  //   auction  = "Sold In Auction"
  //   before   = "Sold Before Auction Date"
  //   private  = "Private Sale" or "Auction Failed, Sold in Private" (the second is also marked "passed in")
  //   notsold  = "Currently Listed…", "Auction Failed, On Private Sale Now", "…Price Not Published Yet"
  const METHODS = { auction: 'Sold at auction', before: 'Sold before auction', private: 'Sold privately', notsold: 'Not sold yet' };
  /**
   * For a property with a sold price whose Status still says it isn't sold:
   *   "Auction Failed, On Private Sale Now" / "…Price Not Published Yet" → sold privately, passed in
   *   "Currently Listed For Auction" → sold before auction if sold before the auction date, at auction if sold
   *       on the auction date, sold privately + passed in if sold after it (it most likely failed at auction first),
   *       or sold privately if either date is missing
   *   anything else (e.g. "Currently Listed For Private Sale") → sold privately
   */
  function soldDespiteStatus(rec) {
    const t = (rec.status || '').toLowerCase();
    if (t.includes('auction failed')) return { method: 'private', passedIn: true };
    if (t.includes('currently listed for auction') && rec.soldDate !== null && rec.auctionDate !== null) {
      if (rec.soldDate < rec.auctionDate) return { method: 'before', passedIn: false };
      if (rec.soldDate === rec.auctionDate) return { method: 'auction', passedIn: false };
      return { method: 'private', passedIn: true };
    }
    return { method: 'private', passedIn: false };
  }

  function saleMethod(status, outcome) {
    if (!status) {   // no Status: fall back to the Outcome column
      const g = outcomeGroup(outcome);
      return { method: g === 'listed' ? 'notsold' : g, passedIn: false };
    }
    const t = status.toLowerCase();
    if (t.includes('currently listed') || t.includes('on private sale now') || t.includes('not published')) return { method: 'notsold', passedIn: false };
    if (t.includes('sold in auction') || t.includes('sold at auction')) return { method: 'auction', passedIn: false };
    if (t.includes('sold before auction')) return { method: 'before', passedIn: false };
    if (t.includes('auction failed') && t.includes('sold in private')) return { method: 'private', passedIn: true };
    if (t === 'private sale' || t.includes('sold in private') || t.includes('sold privately')) return { method: 'private', passedIn: false };
    return { method: null, passedIn: false };
  }
  function splitAgents(s) {
    if (!s) return [];
    return s.split(/\s*(?:,|&|\/|;|\band\b)\s*/i).map((x) => x.trim()).filter((x) => x.length > 1);
  }

  function process(stored) {
    const has = (k) => k in stored.columns;
    const issues = [];
    const notes = [];
    const today = F.todayUTC();

    const rows = stored.rows.map((r) => ({ ...r, suburb: cleanText(r.suburb), status: cleanText(r.status), outcome: cleanText(r.outcome), company: cleanText(r.company) }));

    // Suburbs: known misspellings first, then ignore differences in capitals/spaces.
    const suburbKey = (v) => { const k = v.toLowerCase(); return SUBURB_FIXES[k] ? SUBURB_FIXES[k].toLowerCase() : k; };
    const suburbCanon = makeCanon(rows.map((r) => r.suburb), suburbKey);
    const correct = Object.fromEntries(Object.values(SUBURB_FIXES).map((v) => [v.toLowerCase(), v]));
    const fixedSuburb = (v) => correct[suburbKey(v)] || suburbCanon.get(v);   // the correct spelling always wins

    const statusCanon = makeCanon(rows.map((r) => r.status), lowerKey);
    const outcomeCanon = makeCanon(rows.map((r) => r.outcome), lowerKey);
    statusCanon.merged.concat(outcomeCanon.merged).forEach((m) =>
      notes.push(`Treated ${m.from.map((x) => `“${x}”`).join(', ')} the same as “${m.to}” (capital letters ignored).`));

    // Agencies: use the spreadsheet's own CompanyMap sheet if there is one, then merge
    // names that only differ by spaces, capitals or punctuation (e.g. "VICProp" / "VicProp").
    const cmap = stored.companyMap ? stored.companyMap.map : {};
    const cmapLower = {};
    Object.entries(cmap).forEach(([k, v]) => { cmapLower[k.toLowerCase()] = v; });
    const mapped = rows.map((r) => (r.company ? (cmap[r.company] || cmapLower[r.company.toLowerCase()] || r.company) : null));
    const companyCanon = makeCanon(mapped, norm);
    if (stored.companyMap) notes.push(`Agency names were tidied using the “${stored.companyMap.sheet}” sheet in your spreadsheet.`);
    const companyChanges = new Map();
    rows.forEach((r, i) => {
      const final = mapped[i] ? companyCanon.get(mapped[i]) : null;
      if (r.company && final && final !== r.company) {
        if (!companyChanges.has(final)) companyChanges.set(final, new Set());
        companyChanges.get(final).add(r.company);
      }
    });
    companyChanges.forEach((from, to) => notes.push(`Agency ${[...from].map((x) => `“${x}”`).join(', ')} counted as “${to}”.`));

    const records = rows.map((r, i) => {
      const rec = {
        id: i,
        no: r.no == null ? null : (toNum(r.no) != null ? toNum(r.no) : cleanText(r.no)),
        suburbRaw: r.suburb,
        suburb: fixedSuburb(r.suburb),
        status: statusCanon.get(r.status),
        outcome: outcomeCanon.get(r.outcome),
        area: toNum(r.area),
        priceHigh: toNum(r.priceHigh),
        predicted: toNum(r.predicted),
        reserve: toNum(r.reserve),
        sold: toNum(r.sold),
        company: mapped[i] ? companyCanon.get(mapped[i]) : 'Unknown agency',
        companyRaw: r.company,
        agentText: cleanText(r.agent),
        address: cleanText(r.address),
        link: cleanText(r.link)
      };
      rec.agents = splitAgents(rec.agentText);
      if (rec.area !== null && rec.area <= 0) rec.area = null;
      if (rec.priceHigh !== null && rec.priceHigh <= 0) rec.priceHigh = null;
      if (rec.predicted !== null && rec.predicted <= 0) rec.predicted = null;
      if (rec.reserve !== null && rec.reserve <= 0) rec.reserve = null;
      if (rec.no !== null && typeof rec.no === 'number') rec.no = Math.round(rec.no);
      if (!rec.outcome && rec.status) rec.outcome = rec.status;   // no Outcome column: fall back to Status
      if (!rec.outcome) rec.outcome = 'Not recorded';

      const add = (type, detail) => issues.push({ type, no: rec.no, address: rec.address, suburb: rec.suburb, recId: rec.id, detail });

      // Dates
      ['listingDate', 'auctionDate', 'soldDate'].forEach((k) => {
        const d = toDate(r[k], stored.date1904);
        rec[k] = d.ms;
        if (d.bad) add('badDate', `${COLUMNS[k].label} is “${String(r[k]).slice(0, 40)}”`);
      });

      // Sold?  (same rule as the Excel dashboard: has a sold price above $0)
      rec.isSold = rec.sold !== null && rec.sold > 0;
      rec.soldMonth = rec.isSold && rec.soldDate !== null ? F.monthKey(rec.soldDate) : null;

      // Days on market = sold date − listing date
      rec.dom = null;
      if (rec.isSold && rec.listingDate !== null && rec.soldDate !== null) {
        const d = Math.round((rec.soldDate - rec.listingDate) / F.DAY);
        if (d < 0) add('negDom', `Listed ${F.date(rec.listingDate)}, sold ${F.date(rec.soldDate)} (${d} days)`);
        else rec.dom = d;
      }

      // $ per square metre of land
      rec.ppsqm = rec.isSold && rec.area ? rec.sold / rec.area : null;

      // Prediction error = (sold − predicted) ÷ predicted.  Positive means it sold for MORE than predicted.
      rec.predErr = null;
      if (rec.isSold && rec.predicted) {
        const e = (rec.sold - rec.predicted) / rec.predicted;
        if (Math.abs(e) > MAX_ERROR) add('predOutlier', `Predicted ${F.money(rec.predicted)}, sold ${F.money(rec.sold)}`);
        else rec.predErr = e;
      }

      // Sold price compared with the top of the price guide
      rec.guideErr = null;
      if (rec.isSold && rec.priceHigh) {
        const e = (rec.sold - rec.priceHigh) / rec.priceHigh;
        if (Math.abs(e) > MAX_ERROR) add('guideOutlier', `Price guide top ${F.money(rec.priceHigh)}, sold ${F.money(rec.sold)}`);
        else rec.guideErr = e;
      }

      const how = saleMethod(rec.status, rec.outcome);
      rec.method = how.method;          // auction / before / private / notsold (null if unrecognised)
      rec.passedIn = how.passedIn;      // failed at auction, then sold privately
      // A sold price wins over a "not sold yet" Status (the Status just hasn't been updated).
      rec.statusNotUpdated = rec.method === 'notsold' && rec.isSold;
      if (rec.statusNotUpdated) Object.assign(rec, soldDespiteStatus(rec));
      rec.statusGroup = statusGroup(rec.status);
      rec.outcomeGroup = outcomeGroup(rec.outcome);

      // ---- other checks ----
      if (rec.suburbRaw && SUBURB_FIXES[rec.suburbRaw.toLowerCase()]) add('suburbSpelling', `Spelled “${rec.suburbRaw}”, counted as ${rec.suburb}`);
      if (!rec.area && has('area')) add('noArea', rec.isSold ? 'Sold, so $/m² is missing' : 'Not sold yet');
      if (rec.area && (rec.area < SMALL_LAND || rec.area > BIG_LAND)) add('unusualArea', `${F.num(rec.area)} m²`);
      const soldish = rec.soldDate !== null || ['auction', 'before', 'private'].includes(rec.statusGroup);
      if (!rec.isSold && soldish && has('sold')) add('soldNoPrice', `Status “${rec.status || '–'}”${rec.soldDate ? `, sold date ${F.date(rec.soldDate)}` : ''}`);
      if (rec.isSold && rec.soldDate === null && has('soldDate')) add('priceNoDate', `Sold for ${F.money(rec.sold)}`);
      if (rec.isSold && rec.sold < LOW_PRICE) add('lowPrice', F.money(rec.sold));
      if (rec.soldDate !== null && rec.soldDate > today) add('futureDate', `Sold date ${F.date(rec.soldDate)}`);
      if (rec.statusNotUpdated) add('listedWithPrice', `Status “${rec.status}”, sold for ${F.money(rec.sold)}. Counted as: ${METHODS[rec.method]}${rec.passedIn ? ' (passed in)' : ''}`);
      if (rec.status && !rec.method) add('unknownStatus', `Status “${rec.status}”`);
      if (rec.statusGroup && rec.outcomeGroup && rec.statusGroup !== rec.outcomeGroup) add('statusMismatch', `Status “${rec.status}” but Outcome “${rec.outcome}”`);
      if (rec.link && !F.safeUrl(rec.link)) add('badLink', rec.link.slice(0, 60));
      if (rec.isSold && rec.listingDate === null && has('listingDate')) add('noListingDate', `Sold ${F.date(rec.soldDate)}`);
      if (!rec.companyRaw && has('company')) add('noCompany', '');
      return rec;
    });

    // Same address more than once
    if (has('address')) {
      const fixAddr = (a) => {
        let s = a.toLowerCase();
        Object.keys(SUBURB_FIXES).forEach((bad) => { s = s.replace(new RegExp('\\b' + bad + '\\b', 'g'), SUBURB_FIXES[bad].toLowerCase()); });
        return norm(s);
      };
      F.groupBy(records.filter((r) => r.address), (r) => fixAddr(r.address)).forEach((group) => {
        if (group.length < 2) return;
        group.forEach((r) => {
          const others = group.filter((o) => o !== r).map((o) =>
            `No ${o.no ?? '?'}${o.isSold ? ` (sold ${F.date(o.soldDate)} for ${F.money(o.sold)})` : ' (not sold)'}`);
          issues.push({ type: 'duplicate', no: r.no, address: r.address, suburb: r.suburb, recId: r.id,
            detail: `${r.isSold ? `Sold ${F.date(r.soldDate)} for ${F.money(r.sold)}` : 'Not sold'}. Also: ${others.join('; ')}` });
        });
      });
    }

    const missing = Object.keys(COLUMNS).filter((k) => !has(k));
    if (stored.blankRows) notes.push(`${F.num(stored.blankRows)} rows without a suburb were skipped (they are empty rows in the table).`);

    return {
      meta: { fileName: stored.fileName, loadedAt: stored.loadedAt, sheetName: stored.sheetName },
      columns: stored.columns,
      missing,
      has,
      records,
      issues,
      notes
    };
  }

  window.DataReader = { COLUMNS, ISSUE_TYPES, METHODS, UserError, readWorkbook, process };
})();
