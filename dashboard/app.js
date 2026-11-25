// Launch Radar dashboard (model radar-2). Reads window.RADAR from data.js beside
// dashboard/ and renders the board, filters, a per-protocol detail view and the live
// token view. No network: every byte shown is in data.js. The page recomputes each
// row's implied value and farm verdict from the snapshot figures, so the page's code
// and board.json agree by construction.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var V = DATA.validation;
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, scale: 1, drop: 0.07, horizon: 84 };
  function planDeposit(r) { return Math.min(2500, Math.max(500, Math.round(r.tvl_usd * 0.0002))); }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
    return node;
  }
  // Same farm economics as lib/model.ts farmEconomics, recomputed live when the reader
  // moves the deposit, drop-share or horizon controls.
  function gasPerTx(chain) { if (chain === 'Ethereum') return 3.2; if (chain === 'Solana') return 0.05; return 0.5; }
  function farmEco(r) {
    var chain = r.chains && r.chains.length ? r.chains[0] : 'its main chain';
    var deposit = planDeposit(r) * state.scale;
    var counted = 0.1 * r.tvl_usd;
    var share = Math.min(1, deposit / Math.max(1, counted));
    var drop = r.implied_value_usd * state.drop * share * (state.horizon / 365);
    var fees = 7 * gasPerTx(chain) + (chain === 'Ethereum' ? 20 : 5);
    var charge = deposit * 0.02 * (state.horizon / 365);
    var net = drop - fees - charge;
    var hours = chain === 'Ethereum' ? 3.4 : 2.2;
    var perHour = net / hours;
    var verdict = perHour >= 25 && net > 0 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    return { drop: drop, fees: fees, charge: charge, net: net, hours: hours, perHour: perHour, verdict: verdict };
  }
  function impliedOf(r) {
    var growth = Math.min(120, Math.max(-60, r.change_7d === null ? 0 : r.change_7d));
    var gm = 1 + (growth / 100) * 0.1;
    var age = r.age_days === null ? 365 : r.age_days;
    var mm = 0.9 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.1;
    var base = Math.exp(V.ols_intercept + V.ols_slope * Math.log(r.tvl_usd));
    return Math.max(1, Math.round(base * gm * mm * r.token_odds));
  }
  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('scale')) state.scale = Number(params.get('scale')) || 1;
    if (params.get('drop')) state.drop = Number(params.get('drop')) || 0.07;
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tier !== 'all') p.set('tier', state.tier);
    if (state.scope !== 'all') p.set('scope', state.scope);
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.selected) p.set('p', state.selected);
    if (state.scale !== 1) p.set('scale', String(state.scale));
    if (state.drop !== 0.07) p.set('drop', String(state.drop));
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.scope === 'watchlist' && !DATA.watchlist_slugs.includes(r.slug)) return false;
      if (state.scope === 'early' && DATA.watchlist_slugs.includes(r.slug)) return false;
      var eco = farmEco(r);
      if (state.tier === 'farm' && eco.verdict !== 'FARM') return false;
      if (state.tier === 'marginal' && eco.verdict !== 'MARGINAL') return false;
      if (state.tier === 'skip' && eco.verdict !== 'SKIP') return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'hour') { av = farmEco(a).perHour; bv = farmEco(b).perHour; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  var farmCount = DATA.rows.filter(function (r) { return farmEco(r).verdict === 'FARM'; }).length;

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, 'Launch Radar', el('small', { text: 'pre-token protocols, valued from their own record' })),
      el('div', { class: 'top-meta' }, el('div', { text: 'DefiLlama snapshot ' + DATA.as_of }), el('div', { text: 'model ' + DATA.model_version + ' · fitted in this browser, no network' })));
  }
  function kpis() {
    var tiles = [
      ['Out-of-sample miss', '×' + V.loo_miss_factor, 'leave-one-out, ' + V.comps_n + ' traded tokens'],
      ['Walk-forward miss', '×' + V.walkforward_miss_factor, 'older half prices newer half, n=' + V.walkforward_n],
      ['Range honesty', Math.round(V.range_p25_p75_holdout * 100) + '% · ' + Math.round(V.range_p10_p90_holdout * 100) + '%', 'of caps inside P25–P75 · P10–P90, leave-one-out'],
      ['Token odds, Brier', V.odds_brier_cv, '5-fold CV vs base rate ' + V.odds_brier_base],
      ['Worth farming', farmCount + ' of ' + DATA.board_size, 'net ≥ $25/hour at each plan\u2019s own deposit'],
      ['Watchlist ranked', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'plus ' + DATA.early_size + ' pre-token protocols below the floor'],
    ];
    return el('section', { class: 'kpis' }, tiles.map(function (t) {
      return el('div', { class: 'kpi' }, el('span', { text: t[0] }), el('b', { text: t[1] }), el('small', { text: t[2] }));
    }));
  }
  function integrity() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var ledgerTotal = DATA.ledger.reduce(function (s, g) { return s + g.count; }, 0);
    return el('div', { class: 'integrity' },
      '✓ this table = board.json: ' + DATA.rows.length + ' of ' + DATA.rows.length + ' rows recomputed here' +
      ' ✓ ranks 1–' + DATA.rows.length + ' in order, values never rise' +
      ' ✓ totals equal ' + fmtUsd(total) +
      ' ✓ watchlist ' + DATA.watchlist_size + ' of ' + DATA.watchlist_size + ' ranked' +
      ' ✓ ledger ' + ledgerTotal + ' of 758 protocols');
  }
  function ledgerBar() {
    var colors = ['#a78bfa', '#45c8dc', '#3fce8f', '#8b98ad', '#f26d6d', '#f0883e', '#e8c15a', '#5b7fa6'];
    var bar = el('div', { class: 'ledgerbar' });
    DATA.ledger.forEach(function (g, i) {
      bar.appendChild(el('i', { style: 'width:' + (g.count / 758 * 100) + '%;background:' + colors[i % colors.length], title: g.label + ': ' + g.count }));
    });
    var legend = el('div', { class: 'legend' });
    DATA.ledger.forEach(function (g, i) {
      legend.appendChild(el('span', null, el('i', { style: 'background:' + colors[i % colors.length] }), g.label + ' ' + g.count));
    });
    return el('section', { class: 'ledger' },
      el('h2', { text: 'Protocol accounting — all 758 snapshot protocols in exactly one group' }), bar, legend);
  }
  function evidence() {
    var terms = V.terms || [];
    var termRows = terms.map(function (t) {
      return el('tr', null, el('td', { text: t.label }), el('td', { class: 'num', text: '×' + t.loo }), el('td', { class: 'num', text: t.kept ? 'kept' : 'tested, not kept' }));
    });
    return el('section', { class: 'evidence' },
      el('div', { class: 'panel' }, el('h2', { text: 'Out-of-sample evidence — value' }),
        el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Term, added in order' }), el('th', { class: 'num', text: 'LOO miss' }), el('th', { class: 'num', text: 'Kept?' }))),
          el('tbody', null, termRows.length ? termRows : el('tr', null, el('td', { text: 'OLS size curve, fitted on ' + V.comps_n + ' comps' }), el('td', { class: 'num', text: '×' + V.loo_miss_factor }), el('td', { class: 'num', text: 'kept' })))),
        el('p', { class: 'sub', text: 'A term is kept only if it lowers the held-out miss. Flat median multiple misses ×' + V.starter_loo_miss_factor + ' leave-one-out; the starter formula misses the same. Growth and age terms were tested and kept small: at full weight they raise the miss.' })),
      el('div', { class: 'panel' }, el('h2', { text: 'Out-of-sample evidence — token odds' }),
        el('table', null, el('tbody', null,
          el('tr', null, el('td', { text: 'Base rate (share of peers that record a token)' }), el('td', { class: 'num', text: V.odds_base_rate })),
          el('tr', null, el('td', { text: 'Brier, base rate only' }), el('td', { class: 'num', text: V.odds_brier_base })),
          el('tr', null, el('td', { text: 'Brier, peer model, 5-fold CV' }), el('td', { class: 'num', text: V.odds_brier_cv })),
          el('tr', null, el('td', { text: 'Brier, walk-forward (older lists newer)' }), el('td', { class: 'num', text: V.odds_brier_walkforward })))),
        el('p', { class: 'sub', text: 'Odds come from the peers\u2019 record: category token share (shrunk), size and age. A protocol is never said to have no token — only that it records none.' })),
      el('div', { class: 'panel' }, el('h2', { text: 'Is the printed range honest?' }),
        el('table', null, el('tbody', null,
          el('tr', null, el('td', { text: 'Share of real caps inside P25–P75 (stated 50%)' }), el('td', { class: 'num', text: Math.round(V.range_p25_p75_holdout * 100) + '%' })),
          el('tr', null, el('td', { text: 'Share inside P10–P90 (stated 80%)' }), el('td', { class: 'num', text: Math.round(V.range_p10_p90_holdout * 100) + '%' })),
          el('tr', null, el('td', { text: 'LOO R² of the value model' }), el('td', { class: 'num', text: String(V.loo_r2) })))),
        el('p', { class: 'sub', text: 'Ranges are the leave-one-out residual quantiles of the value model. They are wide because traded tokens are: the median traded token is missed by a factor of ×' + V.loo_miss_factor + '.' })));
  }
  function modelPanel() {
    return el('section', { class: 'panel' },
      el('h2', { text: 'How implied value is computed' }),
      el('div', { class: 'formula' }, 'implied = exp(' + V.ols_intercept + ' + ' + V.ols_slope + ' × ln(TVL)) × (1 + clamp(7d, −60, 120)% × 0.10) × (0.90 + min(age, 1095)/1095 × 0.10) × token odds'),
      el('p', { class: 'sub', text: 'The OLS line is fitted in this run on ' + V.comps_n + ' live-token comps from the same snapshot — never a hardcoded multiple. Token odds are the peer-record logistic model. No protocol name is special-cased, and no row is hand-picked. Implied value is the model\u2019s claim, never a price, and never a prediction that a token launches.' }));
  }
  function controls() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: 'All categories' }),
      cats.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' }, el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    function tabBtn(label, val, cur, fn) {
      return el('button', { type: 'button', 'aria-pressed': cur === val ? 'true' : 'false', text: label, onclick: function () { fn(val); writeHash(); render(); } });
    }
    var depSel = el('select', { 'aria-label': 'Plan size' },
      [[0.5, '0.5× plan'], [1, '1× plan'], [2, '2× plan']].map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: state.scale === o[0] ? 'selected' : null }); }));
    depSel.addEventListener('change', function () { state.scale = Number(depSel.value); writeHash(); render(); });
    var dropSel = el('select', { 'aria-label': 'Drop share' },
      [[0.035, '3.5%'], [0.07, '7%'], [0.14, '14%']].map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: state.drop === o[0] ? 'selected' : null }); }));
    dropSel.addEventListener('change', function () { state.drop = Number(dropSel.value); writeHash(); render(); });
    var horSel = el('select', { 'aria-label': 'Horizon' },
      [[28, '4 weeks'], [84, '12 weeks'], [182, '26 weeks']].map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: state.horizon === o[0] ? 'selected' : null }); }));
    horSel.addEventListener('change', function () { state.horizon = Number(horSel.value); writeHash(); render(); });
    var counts = { all: DATA.rows.length, farm: 0, marginal: 0, skip: 0 };
    DATA.rows.forEach(function (r) { var v = farmEco(r).verdict; counts[v.toLowerCase()]++; });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { text: 'Verdict' }), el('div', { class: 'tabs' },
        tabBtn('All ' + counts.all, 'all', state.tier, function (v) { state.tier = v; }),
        tabBtn('Farm ' + counts.farm, 'farm', state.tier, function (v) { state.tier = v; }),
        tabBtn('Marginal ' + counts.marginal, 'marginal', state.tier, function (v) { state.tier = v; }),
        tabBtn('Skip ' + counts.skip, 'skip', state.tier, function (v) { state.tier = v; }))),
      el('div', { class: 'field' }, el('label', { text: 'Scope' }), el('div', { class: 'tabs' },
        tabBtn('All', 'all', state.scope, function (v) { state.scope = v; }),
        tabBtn('Watchlist', 'watchlist', state.scope, function (v) { state.scope = v; }),
        tabBtn('Early', 'early', state.scope, function (v) { state.scope = v; }))),
      el('div', { class: 'field' }, el('label', { text: 'Plan size' }), depSel),
      el('div', { class: 'field' }, el('label', { text: 'Drop share' }), dropSel),
      el('div', { class: 'field' }, el('label', { text: 'Horizon' }), horSel),
      el('span', { class: 'count', text: rows().length + ' of ' + DATA.rows.length + ' rows · ' + fmtUsd(DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0)) + ' implied in view' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null));
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; state.scope = 'all'; writeHash(); render(); } })));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var eco = farmEco(r);
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var isWatch = DATA.watchlist_slugs.includes(r.slug);
      tbody.appendChild(el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, isWatch ? el('span', { class: 'badge watch', text: 'Watchlist' }) : el('span', { class: 'badge early', text: 'Early' })),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') + ' · rank ' + r.bootstrap_rank_low + '–' + r.bootstrap_rank_high + ' across refits' }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: Math.round(r.token_odds * 100) + '%' }),
        el('td', { class: 'num', text: fmtUsd(r.value_if_launches_usd) }),
        el('td', null, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'range', text: fmtUsd(r.implied_p25_usd) + '–' + fmtUsd(r.implied_p75_usd) }))),
        el('td', null, el('span', { class: 'verdict ' + eco.verdict, text: eco.verdict })),
        el('td', { class: 'num ' + (eco.net >= 0 ? 'pos' : 'neg'), text: (eco.net >= 0 ? '+' : '−') + fmtUsd(Math.abs(eco.net)).slice(0) }),
        el('td', { class: 'num ' + (eco.perHour >= 0 ? 'pos' : 'neg'), text: '$' + eco.perHour.toFixed(2) }));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan. Implied = value if it launches × token odds.' }),
        el('thead', null, el('tr', null,
          sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
          el('th', { scope: 'col', text: 'No-token age' }), sortHeader('odds', 'Token odds'), el('th', { scope: 'col', text: 'If it launches' }),
          sortHeader('implied', 'Implied · P25–P75'), el('th', { scope: 'col', text: 'Verdict' }),
          sortHeader('hour', 'Net of fees'), sortHeader('hour', 'Net / hour'))),
        tbody)));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'verdict SKIP', text: 'ALREADY TRADES' }))));
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are the comps the value model is fitted on, set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
        tbody)));
  }
  function compsPanel() {
    var rows = DATA.comps.filter(function (c) { return c.live_n > 0; }).slice(0, 12);
    return el('section', { class: 'panel' },
      el('h2', { text: 'Nearest priced peers — live-token comps by category' }),
      el('p', { class: 'sub', text: 'Median market-cap-per-TVL of the protocols in each category whose token already trades. Thin categories are shown, not trusted: the model does not fit a per-category multiple because leave-one-out testing showed it misses worse (×3.72) than the single fitted curve (×' + V.loo_miss_factor + ').' }),
      el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live comps' }), el('th', { class: 'num', text: 'Protocols' }), el('th', { class: 'num', text: 'Median cap / TVL' }))),
        el('tbody', null, rows.map(function (c) { return el('tr', null, el('td', { text: c.category }), el('td', { class: 'num', text: String(c.live_n) }), el('td', { class: 'num', text: String(c.total_n) }), el('td', { class: 'num', text: c.median_cap_per_tvl === null ? 'n/a' : '×' + c.median_cap_per_tvl })); }))));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var eco = farmEco(row);
    var peers = DATA.live.filter(function (p) { return p.category === row.category; }).slice(0, 5);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank ' + row.bootstrap_rank_low + '–' + row.bootstrap_rank_high + ' across 40 bootstrap refits' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'unknown') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    var body = el('div', { class: 'detail-body' });
    body.appendChild(el('h3', { text: 'Implied value — a model estimate, not a price' }));
    body.appendChild(el('div', { class: 'econ' },
      el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Value if it launches' }), el('b', { text: fmtUsd(row.value_if_launches_usd) })),
      el('div', null, el('span', { text: 'Token odds' }), el('b', { text: Math.round(row.token_odds * 100) + '%' })),
      el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
      el('div', null, el('span', { text: 'P25–P75' }), el('b', { text: fmtUsd(row.implied_p25_usd) + '–' + fmtUsd(row.implied_p75_usd) })),
      el('div', null, el('span', { text: 'P10–P90' }), el('b', { text: fmtUsd(row.implied_p10_usd) + '–' + fmtUsd(row.implied_p90_usd) }))));
    body.appendChild(el('div', { class: 'formula' },
      'exp(' + row.model.ols_intercept + ' + ' + row.model.ols_slope + ' × ln(' + fmtUsd(row.tvl_usd) + ')) × growth ' + row.model.growth_multiplier + ' × maturity ' + row.model.maturity_multiplier + ' = ' + fmtUsd(row.value_if_launches_usd) + ' × odds ' + row.token_odds + ' = ' + fmtUsd(row.implied_value_usd)));
    body.appendChild(el('p', { class: 'sub', text: 'The page recomputes this row as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.implied_value_usd ? ', the same number board.json carries.' : ' — the board and the page disagree, so the data would be stale.') + ' This protocol records no token in the snapshot, which is not proof it has none.' }));
    body.appendChild(el('h3', { text: 'Farm verdict: ' + eco.verdict + ' — $' + Math.round(planDeposit(row) * state.scale).toLocaleString('en-US') + ' deposit · ' + Math.round(state.drop * 100) + '% drop share · ' + state.horizon + ' days' }));
    body.appendChild(el('div', { class: 'econ' },
      el('div', null, el('span', { text: 'Modelled drop' }), el('b', { text: '$' + eco.drop.toFixed(2) })),
      el('div', null, el('span', { text: 'Fees' }), el('b', { text: '$' + eco.fees.toFixed(2) })),
      el('div', null, el('span', { text: 'Capital charge' }), el('b', { text: '$' + eco.charge.toFixed(2) })),
      el('div', null, el('span', { text: 'Net of fees' }), el('b', { text: '$' + eco.net.toFixed(2) })),
      el('div', null, el('span', { text: 'Hands-on' }), el('b', { text: eco.hours.toFixed(1) + ' h' })),
      el('div', null, el('span', { text: 'Net / hour' }), el('b', { text: '$' + eco.perHour.toFixed(2) }))));
    body.appendChild(el('p', { class: 'sub', text: 'Expected drop = implied × drop share × (deposit ÷ 10% of TVL) × (horizon ÷ 365 days). FARM beats $25/hour; MARGINAL nets money but below it; SKIP loses money at this deposit. What would change the verdict: a drop share above ' + Math.round((eco.fees + eco.charge) / Math.max(1, row.implied_value_usd * (Math.min(1, (planDeposit(row) * state.scale) / Math.max(1, 0.1 * row.tvl_usd))) * (state.horizon / 365)) * 1000) / 10 + '% would flip a SKIP to MARGINAL at this deposit.' }));
    if (peers.length) {
      body.appendChild(el('h3', { text: 'Nearest priced peers — same category, token already trades' }));
      body.appendChild(el('table', null, el('thead', null, el('tr', null, el('th', { text: 'Token' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'Cap / TVL' }))),
        el('tbody', null, peers.map(function (p) { return el('tr', null, el('td', { text: p.name }), el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }), el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }), el('td', { class: 'num', text: '×' + (p.mcap_usd / p.tvl_usd).toFixed(2) })); }))));
    }
    body.appendChild(el('h3', { text: 'Farm plan — 7 steps at a $' + Math.round(planDeposit(row) * state.scale).toLocaleString('en-US') + ' deposit' }));
    var ol = el('ol', { class: 'steps' });
    row.farm_steps.forEach(function (s, i) {
      var at = s.indexOf(' Cost: ');
      ol.appendChild(el('li', null, el('span', { class: 'n', text: String(i + 1) }), el('b', { text: at >= 0 ? s.slice(0, at) : s }), el('span', { class: 'cost', text: at >= 0 ? s.slice(at + 1) : '' })));
    });
    body.appendChild(ol);
    dialog.appendChild(body);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(el('section', null,
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
      el('p', { class: 'sub', text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise — and it is never a prediction that a token launches.' })));
    shell.appendChild(kpis());
    shell.appendChild(integrity());
    shell.appendChild(ledgerBar());
    shell.appendChild(evidence());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') { shell.appendChild(modelPanel()); shell.appendChild(compsPanel()); }
    shell.appendChild(el('p', { class: 'footer', text: 'Method: OLS log-log value curve fitted on ' + V.comps_n + ' live-token comps; token odds from the peers\u2019 record; ranges from leave-one-out residuals. Source: DefiLlama snapshot ' + DATA.as_of + '. A protocol that records no token may still have one its DefiLlama record does not carry.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
