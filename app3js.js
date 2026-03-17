// ============================================================
// SUPABASE PERSISTENCE LAYER
// ============================================================
var SUPA_URL = 'https://hzpbytknlpeuaamysjbl.supabase.co';
var SUPA_KEY = 'sb_publishable_sL4HXypL0G1WncdDaWoiTg_Z3tXv7y0';

function supaFetch(path, method, body) {
  return fetch(SUPA_URL + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) { return r.json(); });
}

function loadProspectsFromDB() {
  return supaFetch('prospects?order=created_at.desc').then(function(rows) {
    if (!Array.isArray(rows)) { console.error('DB load failed', rows); return; }
    prospects = rows.map(function(r) {
      return {
        id: r.id,
        fn: r.first_name || '',
        ln: r.last_name || '',
        title: r.title || '',
        company: r.company || '',
        companyLocation: r.company_location || '',
        email: r.email || '',
        li: r.linkedin_url || '',
        phone: r.phone || '',
        stage: r.stage || 'New',
        apolloId: r.apollo_id || '',
        research: r.research_notes || '',
        outreachStep: r.outreach_step || 0
      };
    });
    renderProspects();
  }).catch(function(e) { console.error('DB load error', e); });
}

function saveProspectToDB(p) {
  return supaFetch('prospects', 'POST', {
    first_name: p.fn,
    last_name: p.ln,
    title: p.title,
    company: p.company,
    company_location: p.companyLocation || '',
    email: p.email,
    linkedin_url: p.li,
    phone: p.phone || '',
    stage: p.stage || 'New',
    apollo_id: p.apolloId || '',
    research_notes: p.research || '',
    outreach_step: p.outreachStep || 0
  }).then(function(rows) {
    if (Array.isArray(rows) && rows[0]) { p.id = rows[0].id; }
  }).catch(function(e) { console.error('DB save error', e); });
}

function updateProspectInDB(p) {
  if (!p.id) return saveProspectToDB(p);
  return supaFetch('prospects?id=eq.' + p.id, 'PATCH', {
    first_name: p.fn,
    last_name: p.ln,
    title: p.title,
    company: p.company,
    company_location: p.companyLocation || '',
    email: p.email,
    linkedin_url: p.li,
    phone: p.phone || '',
    stage: p.stage || 'New',
    research_notes: p.research || '',
    outreach_step: p.outreachStep || 0
  }).catch(function(e) { console.error('DB update error', e); });
}

function deleteProspectFromDB(id) {
  if (!id) return;
  return supaFetch('prospects?id=eq.' + id, 'DELETE')
    .catch(function(e) { console.error('DB delete error', e); });
}

function saveSettingToDB(key, value) {
  return supaFetch('settings', 'POST', { key: key, value: value })
    .catch(function() {
      return supaFetch('settings?key=eq.' + key, 'PATCH', { value: value });
    });
}

function loadSettingsFromDB() {
  return supaFetch('settings').then(function(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(function(r) {
      if (r.key === 'apolloKey') {
        var el = document.getElementById('s-apollo');
        if (el) el.value = r.value;
        apolloKey = r.value;
      }
      if (r.key === 'anthropicKey') {
        var el2 = document.getElementById('s-anthropic');
        if (el2) el2.value = r.value;
      }
    });
  }).catch(function(e) { console.error('Settings load error', e); });
}

// ============================================================
// END SUPABASE LAYER
// ============================================================

// ── globals ──────────────────────────────────────────────────
var prospects = [];
var leads = [];
var titleTags = ['CEO','CTO','VP'];
var currentPage = 1;
var pageSize = 25;
var totalLeads = 0;
var apolloKey = '';
var PROXY = 'https://apollo-proxy.jason-939.workers.dev';

// ── tab switching ─────────────────────────────────────────────
function showTab(t) {
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.style.display = 'none'; });
  var btn = document.querySelector('[data-tab="' + t + '"]');
  if (btn) btn.classList.add('active');
  var panel = document.getElementById('tab-' + t);
  if (panel) panel.style.display = 'block';
  if (t === 'prospects') renderProspects();
  if (t === 'settings') loadSettingsFromDB();
}

// ── title tags ────────────────────────────────────────────────
function renderTitleTags() {
  var box = document.getElementById('title-tags');
  if (!box) return;
  box.innerHTML = '';
  titleTags.forEach(function(tag, i) {
    var span = document.createElement('span');
    span.className = 'tag-pill';
    span.textContent = tag;
    var x = document.createElement('span');
    x.className = 'tag-x';
    x.textContent = '\u00d7';
    x.onclick = function() { titleTags.splice(i, 1); renderTitleTags(); };
    span.appendChild(x);
    box.appendChild(span);
  });
}

function initTitles() {
  var inp = document.getElementById('title-input');
  if (!inp) return;
  renderTitleTags();
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      var v = inp.value.trim().replace(/,$/, '');
      if (v && titleTags.indexOf(v) === -1) { titleTags.push(v); renderTitleTags(); }
      inp.value = '';
    } else if (e.key === 'Backspace' && inp.value === '' && titleTags.length) {
      titleTags.pop(); renderTitleTags();
    }
  });
}

// ── Apollo lists ──────────────────────────────────────────────
function loadApolloLists() {
  var sel = document.getElementById('f-list');
  if (!sel) return;
  var key = apolloKey || (document.getElementById('s-apollo') ? document.getElementById('s-apollo').value : '');
  if (!key) return;
  sel.innerHTML = '<option value="">All of Apollo (no list filter)</option>';
  fetch(PROXY + '/apollo/labels?page=1&per_page=100', {
    headers: { 'X-Apollo-Key': key }
  }).then(function(r) { return r.json(); }).then(function(d) {
    var labels = (d.labels || d.contact_labels || []);
    labels.forEach(function(l) {
      var opt = document.createElement('option');
      opt.value = l.id + '|' + (l.modality || 'people');
      opt.textContent = l.name + ' (' + (l.cached_count || 0) + ') — ' + (l.modality === 'account' ? 'Companies' : 'People');
      sel.appendChild(opt);
    });
  }).catch(function(e) { console.error('Labels error', e); });
}

function loadListAccounts(listId) {
  var key = apolloKey || (document.getElementById('s-apollo') ? document.getElementById('s-apollo').value : '');
  var tbody = document.getElementById('leads-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px">Loading list...</td></tr>';
  fetch(PROXY + '/apollo/accounts/search', {
    method: 'POST',
    headers: { 'X-Apollo-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: 1, per_page: 100, label_ids: [listId] })
  }).then(function(r) { return r.json(); }).then(function(d) {
    var accounts = d.accounts || [];
    leads = accounts.map(function(a) {
      return {
        fn: a.name || '',
        ln: '',
        title: 'Company',
        company: a.name || '',
        companyLocation: (a.city || '') + (a.state ? ', ' + a.state : ''),
        email: a.phone || '',
        li: a.linkedin_url || '',
        apolloId: a.id,
        isAccount: true
      };
    });
    totalLeads = leads.length;
    renderLeads();
  }).catch(function(e) {
    console.error('Accounts load error', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:20px">Error loading list: ' + e.message + '</td></tr>';
  });
}

function loadPeopleList(listId) {
  var key = apolloKey || (document.getElementById('s-apollo') ? document.getElementById('s-apollo').value : '');
  var tbody = document.getElementById('leads-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px">Loading contacts...</td></tr>';
  var page = currentPage || 1;
  fetch(PROXY + '/apollo/contacts/search', {
    method: 'POST',
    headers: { 'X-Apollo-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: page, per_page: pageSize, label_ids: [listId] })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error || d.message) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:20px">Apollo error: ' + (d.error || d.message) + '</td></tr>';
      return;
    }
    var contacts = d.contacts || [];
    totalLeads = (d.pagination && d.pagination.total_entries) || contacts.length;
    leads = contacts.map(function(c) {
      var acct = c.account || {};
      return {
        fn: c.first_name || '',
        ln: c.last_name || '',
        title: c.title || '',
        company: c.organization_name || acct.name || '',
        companyLocation: (acct.city || c.city || '') + (acct.state || c.state ? ', ' + (acct.state || c.state) : ''),
        email: c.email || '',
        li: c.linkedin_url || '',
        phone: c.phone_numbers && c.phone_numbers[0] ? c.phone_numbers[0].sanitized_number : '',
        apolloId: c.id
      };
    });
    renderLeads();
  }).catch(function(e) {
    console.error('People list error', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:20px">Error: ' + e.message + '</td></tr>';
  });
}

// ── search Apollo ─────────────────────────────────────────────
function runSearch() {
  var listSel = document.getElementById('f-list');
  var listVal = listSel ? listSel.value : '';
  if (listVal) {
    var parts = listVal.split('|');
    var listId = parts[0];
    var modality = parts[1] || 'people';
    if (modality === 'account') { loadListAccounts(listId); return; }
    else { loadPeopleList(listId); return; }
  }

  var key = apolloKey || (document.getElementById('s-apollo') ? document.getElementById('s-apollo').value : '');
  if (!key) { alert('Add your Apollo API key in Settings first.'); return; }

  var seniorities = [];
  document.querySelectorAll('.seniority-btn.active').forEach(function(b) { seniorities.push(b.dataset.val); });

  var loc = document.getElementById('f-location') ? document.getElementById('f-location').value : '';
  var ind = document.getElementById('f-industry') ? document.getElementById('f-industry').value : '';
  var minEmp = document.getElementById('f-min-emp') ? parseInt(document.getElementById('f-min-emp').value) || 1 : 1;
  var maxEmp = document.getElementById('f-max-emp') ? parseInt(document.getElementById('f-max-emp').value) || 10000 : 10000;

  var tbody = document.getElementById('leads-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px">Searching Apollo...</td></tr>';

  var payload = {
    page: currentPage,
    per_page: pageSize,
    person_titles: titleTags,
    person_seniorities: seniorities.length ? seniorities : undefined,
    organization_locations: loc ? [loc] : undefined,
    organization_industry_tag_ids: ind ? [ind] : undefined,
    organization_num_employees_ranges: [minEmp + ',' + maxEmp]
  };

  fetch(PROXY + '/apollo/mixed_people/search', {
    method: 'POST',
    headers: { 'X-Apollo-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error || d.message) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:20px">Apollo error: ' + (d.error || d.message) + '</td></tr>';
      return;
    }
    var people = d.people || d.contacts || [];
    totalLeads = (d.pagination && d.pagination.total_entries) || people.length;
    leads = people.map(function(c) {
      var acct = c.account || c.organization || {};
      return {
        fn: c.first_name || '',
        ln: c.last_name || '',
        title: c.title || '',
        company: c.organization_name || acct.name || '',
        companyLocation: (acct.city || '') + (acct.state ? ', ' + acct.state : ''),
        email: c.email || '',
        li: c.linkedin_url || '',
        phone: c.phone_numbers && c.phone_numbers[0] ? c.phone_numbers[0].sanitized_number : '',
        apolloId: c.id,
        empCount: acct.estimated_num_employees || ''
      };
    });
    renderLeads();
  }).catch(function(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:red;padding:20px">Error: ' + e.message + '</td></tr>';
  });
}

// ── render leads table ────────────────────────────────────────
function renderLeads() {
  var tbody = document.getElementById('leads-body');
  if (!tbody) return;
  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#888">No leads found. Run a search or load a list.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  leads.forEach(function(l, i) {
    var tr = document.createElement('tr');
    var liLink = l.li ? '<a href="' + l.li + '" target="_blank" style="color:#29ABE2">View &#8599;</a>' : '—';
    var loc = l.companyLocation || '—';
    tr.innerHTML =
      '<td><input type="checkbox" class="lead-cb" data-i="' + i + '"></td>' +
      '<td>' + (l.fn + ' ' + l.ln).trim() + '</td>' +
      '<td>' + (l.company || '—') + '</td>' +
      '<td>' + (l.title || '—') + '</td>' +
      '<td>' + loc + '</td>' +
      '<td>' + (l.email || '—') + '</td>' +
      '<td>' + liLink + '</td>' +
      '<td><button class="btn-sm" onclick="addOne(' + i + ')">+ Add</button> <button class="btn-sm btn-ignore" onclick="ignoreOne(' + i + ')">Ignore</button></td>';
    tbody.appendChild(tr);
  });
  renderPagination();
}

function renderPagination() {
  var el = document.getElementById('pagination');
  if (!el) return;
  var total = Math.ceil(totalLeads / pageSize);
  el.innerHTML = 'Page ' + currentPage + ' of ' + (total || 1) + ' &nbsp;';
  if (currentPage > 1) {
    var prev = document.createElement('button');
    prev.className = 'btn-sm';
    prev.textContent = '< Prev';
    prev.onclick = function() { currentPage--; runSearch(); };
    el.appendChild(prev);
  }
  if (currentPage < total) {
    var nxt = document.createElement('button');
    nxt.className = 'btn-sm';
    nxt.textContent = 'Next >';
    nxt.style.marginLeft = '6px';
    nxt.onclick = function() { currentPage++; runSearch(); };
    el.appendChild(nxt);
  }
}

// ── add / ignore leads ────────────────────────────────────────
function addOne(i) {
  var l = leads[i];
  if (!l) return;
  var p = {
    fn: l.fn, ln: l.ln, title: l.title, company: l.company,
    companyLocation: l.companyLocation || '', email: l.email,
    li: l.li, phone: l.phone || '', stage: 'New',
    apolloId: l.apolloId || '', research: '', outreachStep: 0
  };
  prospects.push(p);
  saveProspectToDB(p);
  leads.splice(i, 1);
  renderLeads();
  showToast('Added ' + p.fn + ' ' + p.ln + ' to Prospects');
}

function ignoreOne(i) {
  leads.splice(i, 1);
  renderLeads();
}

function bulkAdd() {
  var checked = document.querySelectorAll('.lead-cb:checked');
  var indices = [];
  checked.forEach(function(cb) { indices.push(parseInt(cb.dataset.i)); });
  indices.sort(function(a, b) { return b - a; });
  indices.forEach(function(i) {
    var l = leads[i];
    var p = {
      fn: l.fn, ln: l.ln, title: l.title, company: l.company,
      companyLocation: l.companyLocation || '', email: l.email,
      li: l.li, phone: l.phone || '', stage: 'New',
      apolloId: l.apolloId || '', research: '', outreachStep: 0
    };
    prospects.push(p);
    saveProspectToDB(p);
    leads.splice(i, 1);
  });
  renderLeads();
  showToast('Added ' + indices.length + ' prospects');
}

function bulkIgnore() {
  var checked = document.querySelectorAll('.lead-cb:checked');
  var indices = [];
  checked.forEach(function(cb) { indices.push(parseInt(cb.dataset.i)); });
  indices.sort(function(a, b) { return b - a; });
  indices.forEach(function(i) { leads.splice(i, 1); });
  renderLeads();
}

// ── prospects ─────────────────────────────────────────────────
var STAGES = ['New', 'Researching', 'Messaged', 'Replied', 'Call Scheduled'];

function renderProspects() {
  var wrap = document.getElementById('prospect-cards');
  if (!wrap) return;
  var filter = document.getElementById('stage-filter') ? document.getElementById('stage-filter').value : '';
  var list = filter ? prospects.filter(function(p) { return p.stage === filter; }) : prospects;
  if (!list.length) {
    wrap.innerHTML = '<p style="color:#888;text-align:center;padding:40px">No prospects yet. Add leads from Find Leads tab.</p>';
    return;
  }
  wrap.innerHTML = '';
  list.forEach(function(p, i) {
    var card = document.createElement('div');
    card.className = 'prospect-card';
    var stageOpts = STAGES.map(function(s) {
      return '<option value="' + s + '"' + (p.stage === s ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    card.innerHTML =
      '<div class="card-header"><div class="card-name">' + p.fn + ' ' + p.ln + '</div>' +
      '<div class="card-title">' + p.title + '</div>' +
      '<div class="card-company">' + p.company + (p.companyLocation ? ' &bull; ' + p.companyLocation : '') + '</div></div>' +
      '<div class="card-body">' +
      '<select class="stage-select" onchange="setStage(' + i + ',this.value)">' + stageOpts + '</select>' +
      (p.research ? '<div class="research-snippet">' + p.research.substring(0, 100) + '...</div>' : '') +
      '<div class="card-actions">' +
      '<button class="btn-sm" onclick="openResearch(' + i + ')">&#9881; Research</button> ' +
      (p.li ? '<a class="btn-sm" href="' + p.li + '" target="_blank">LinkedIn</a> ' : '') +
      '<button class="btn-sm btn-ignore" onclick="deleteProspect(' + i + ')">Remove</button>' +
      '</div></div>';
    wrap.appendChild(card);
  });
}

function setStage(i, stage) {
  var p = prospects[i];
  if (!p) return;
  p.stage = stage;
  updateProspectInDB(p);
  renderProspects();
}

function deleteProspect(i) {
  var p = prospects[i];
  if (!p) return;
  deleteProspectFromDB(p.id);
  prospects.splice(i, 1);
  renderProspects();
}

function openResearch(i) {
  var p = prospects[i];
  if (!p) return;
  var panel = document.getElementById('research-panel');
  if (panel) {
    panel.style.display = 'block';
    document.getElementById('r-name') && (document.getElementById('r-name').textContent = p.fn + ' ' + p.ln + ' — ' + p.company);
    document.getElementById('r-notes') && (document.getElementById('r-notes').value = p.research || '');
    panel.dataset.idx = i;
  }
  showTab('research');
}

function saveResearch() {
  var panel = document.getElementById('research-panel');
  if (!panel) return;
  var i = parseInt(panel.dataset.idx);
  var p = prospects[i];
  if (!p) return;
  p.research = document.getElementById('r-notes') ? document.getElementById('r-notes').value : '';
  updateProspectInDB(p);
  showToast('Research saved');
}

// ── AI research ───────────────────────────────────────────────
function runAIResearch() {
  var panel = document.getElementById('research-panel');
  if (!panel) return;
  var i = parseInt(panel.dataset.idx);
  var p = prospects[i];
  if (!p) return;

  var anthropicKey = document.getElementById('s-anthropic') ? document.getElementById('s-anthropic').value : '';
  if (!anthropicKey) { alert('Add your Anthropic API key in Settings.'); return; }

  var btn = document.getElementById('run-research-btn');
  if (btn) btn.textContent = 'Researching...';

  var prompt = 'Research this sales prospect and write a friendly LinkedIn connection request message following the 4-step outreach rule (connect first, no pitch).\n\nProspect:\nName: ' + p.fn + ' ' + p.ln + '\nTitle: ' + p.title + '\nCompany: ' + p.company + '\nLocation: ' + (p.companyLocation || 'unknown') + '\n\nProvide:\n1. 3-4 key research insights about this person/company\n2. A short friendly LinkedIn connection request (under 300 chars, no pitch, just genuine interest)\n3. A follow-up thank you message for after they accept';

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  }).then(function(r) { return r.json(); }).then(function(d) {
    var txt = d.content && d.content[0] ? d.content[0].text : 'No response';
    var notes = document.getElementById('r-notes');
    if (notes) notes.value = txt;
    p.research = txt;
    updateProspectInDB(p);
    if (btn) btn.textContent = '&#9889; Run AI Research';
  }).catch(function(e) {
    alert('AI research error: ' + e.message);
    if (btn) btn.textContent = '&#9889; Run AI Research';
  });
}

// ── settings ──────────────────────────────────────────────────
function saveSettings() {
  var ak = document.getElementById('s-apollo') ? document.getElementById('s-apollo').value.trim() : '';
  var anth = document.getElementById('s-anthropic') ? document.getElementById('s-anthropic').value.trim() : '';
  if (ak) { apolloKey = ak; saveSettingToDB('apolloKey', ak); }
  if (anth) saveSettingToDB('anthropicKey', anth);
  showToast('Settings saved to database');
  loadApolloLists();
}

// ── toast ─────────────────────────────────────────────────────
function showToast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(function() { t.style.opacity = '0'; }, 3000);
}

// ── seniority toggle ──────────────────────────────────────────
function toggleSeniority(btn) {
  btn.classList.toggle('active');
}

// ── init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initTitles();
  showTab('leads');
  loadProspectsFromDB();
  loadSettingsFromDB().then(function() {
    loadApolloLists();
  });
});
