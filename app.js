(() => {
  'use strict';

  const STORAGE_KEY = 'siteledger.v1.data';
  const BACKUP_FORMAT = 'siteledger-backup';
  const MONEY = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const money = value => MONEY.format(Number(value) || 0);
  const plain = str => String(str ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const attr = plain;
  const svg = (name, extra = '') => `<svg class="ico ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const id = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`);
  const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
  const readableDate = date => { const [y, m, d] = date.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1].slice(0, 3)} ${y}`; };
  const isDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  };
  const defaultData = () => ({ version: 1, settings: { businessName: 'Build Care' }, projects: [], expenses: [] });
  const total = expenses => expenses.reduce((sum, row) => sum + Number(row.amount), 0);
  let storageWorks = true;

  function readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const data = validateData(JSON.parse(raw));
      if (!data) throw new Error('Saved data has an unexpected structure');
      return data;
    } catch (error) {
      storageWorks = false;
      console.error('Could not load SiteLedger data:', error);
      return defaultData();
    }
  }

  function validateData(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.projects) || !Array.isArray(input.expenses)) return null;
    if (input.version != null && input.version !== 1) return null;
    const businessName = typeof input.settings?.businessName === 'string' ? input.settings.businessName.trim().slice(0, 100) : 'My Business';
    if (input.projects.length > 100000 || input.expenses.length > 1000000) return null;
    const projectIds = new Set();
    const expenseIds = new Set();
    const projects = [];
    const expenses = [];
    for (const item of input.projects) {
      if (!item || typeof item.id !== 'string' || !item.id || projectIds.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || typeof item.client !== 'string' || !item.client.trim()) return null;
      if (item.startDate && !isDate(item.startDate)) return null;
      projectIds.add(item.id);
      projects.push({ id: item.id, name: item.name.trim().slice(0, 160), client: item.client.trim().slice(0, 160), location: typeof item.location === 'string' ? item.location.slice(0, 200) : '', startDate: item.startDate || '', createdAt: typeof item.createdAt === 'string' ? item.createdAt : '' });
    }
    for (const item of input.expenses) {
      if (!item || typeof item.id !== 'string' || !item.id || expenseIds.has(item.id) || !projectIds.has(item.projectId) || typeof item.description !== 'string' || !item.description.trim() || !isDate(item.date) || typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 1e13) return null;
      expenseIds.add(item.id);
      expenses.push({ id: item.id, projectId: item.projectId, description: item.description.trim().slice(0, 200), amount: item.amount, date: item.date, notes: typeof item.notes === 'string' ? item.notes.slice(0, 1000) : '', createdAt: typeof item.createdAt === 'string' ? item.createdAt : '', updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '' });
    }
    return { version: 1, settings: { businessName: businessName || 'My Business' }, projects, expenses };
  }

  let data = readLocal();
  const ui = {
    route: 'add', projectId: '', addProjectId: '', addDate: today(), addDraft: {amount:'',description:'',notes:''},
    projectYear: 'all', projectSort: 'asc', projectSearch: '',
    expenseProject: 'all', expenseYear: 'all', expenseSort: 'asc', expenseSearch: '',
    projectListSearch: ''
  };
  let backupPending = null;
  let toastTimer = null;

  function persist(next, message) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      storageWorks = true;
      data = next;
      showStorageWarning();
      if (message) toast(message);
      return true;
    } catch (error) {
      storageWorks = false;
      showStorageWarning();
      toast('Could not save. Check browser storage, then export a backup.', true);
      console.error('Save failed:', error);
      return false;
    }
  }
  const findProject = projectId => data.projects.find(project => project.id === projectId);
  const findExpense = expenseId => data.expenses.find(expense => expense.id === expenseId);
  const projectExpenses = projectId => data.expenses.filter(expense => expense.projectId === projectId);
  const sortedExpenses = (expenses, order = 'asc') => [...expenses].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return order === 'asc' ? d : -d;
    const c = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (c !== 0) return order === 'asc' ? c : -c;
    return a.id.localeCompare(b.id);
  });
  const createdRecently = (expenses, limit = 6) => [...expenses].sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date)).slice(0, limit);
  const yearsFor = expenses => [...new Set(expenses.map(expense => expense.date.slice(0, 4)))].sort((a, b) => Number(a) - Number(b));
  const yearSelect = (expenses, selected) => `<option value="all">All years</option>${yearsFor(expenses).map(y => `<option value="${y}" ${selected === y ? 'selected' : ''}>${y}</option>`).join('')}`;
  const optionProjects = (selected, allOption = false) => `${allOption ? `<option value="all" ${selected === 'all' ? 'selected' : ''}>All projects</option>` : '<option value="">Select a project</option>'}${data.projects.map(p => `<option value="${attr(p.id)}" ${selected === p.id ? 'selected' : ''}>${plain(p.name)} — ${plain(p.client)}</option>`).join('')}`;
  const formatHeader = (eyebrow, title, subtitle, actions = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${actions ? `<div class="header-actions">${actions}</div>` : ''}</div>`;
  const blank = (icon, heading, message, button = '') => `<div class="empty-state"><div class="empty-icon">${svg(icon)}</div><h3>${heading}</h3><p>${message}</p>${button}</div>`;
  const stat = (label, value, foot, icon) => `<div class="card stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${svg(icon)}</span></div><div class="stat-value" title="${attr(value)}">${value}</div><div class="stat-foot">${foot}</div></div>`;
  const nowMonth = today().slice(0, 7);

  function showStorageWarning() {
    const warning = $('#storageWarning');
    warning.hidden = storageWorks;
    warning.textContent = storageWorks ? '' : 'Browser storage is unavailable or the saved data could not be loaded. Changes may not be saved. Avoid clearing browser/site data.';
  }

  function updateShell() {
    const navRoute = ui.route === 'project' ? 'projects' : ui.route;
    $$('[data-route]').forEach(link => {
      const active = link.dataset.route === navRoute;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const labels = {add:'Add expense',projects:'Projects',project:'Project details',expenses:'All expenses',overview:'Overview',settings:'Settings & backups'};
    $('#topBreadcrumb').innerHTML = `Workspace <span>/</span> <strong>${labels[ui.route]}</strong>`;
    $('#headerDate').textContent = new Intl.DateTimeFormat('en-IN', {weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date());
    const initials = data.settings.businessName.trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'SL';
    $('#headerAvatar').textContent = initials;
    document.title = `${labels[ui.route]} — SiteLedger`;
  }

  function renderView() {
    updateShell();
    let html = '';
    switch (ui.route) {
      case 'add': html = renderAdd(); break;
      case 'projects': html = renderProjects(); break;
      case 'project': html = renderProjectDetail(); break;
      case 'expenses': html = renderAllExpenses(); break;
      case 'overview': html = renderOverview(); break;
      case 'settings': html = renderSettings(); break;
      default: ui.route = 'add'; html = renderAdd();
    }
    $('#view').innerHTML = html;
  }

  function navigate(route, projectId = '') {
    ui.route = route;
    if (route === 'project') ui.projectId = projectId;
    if (route === 'add' && projectId) ui.addProjectId = projectId;
    ui.projectYear = 'all';
    closeSidebar();
    closeModal();
    renderView();
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  function renderAdd() {
    const selected = findProject(ui.addProjectId) || data.projects[0];
    if (selected) ui.addProjectId = selected.id;
    const expenses = selected ? projectExpenses(selected.id) : [];
    const last = createdRecently(data.expenses, 6);
    return `${formatHeader('DAILY ENTRIES', 'Add an expense', 'Record today’s work or enter an older expense. Everything gets sorted by date automatically.', `<span class="head-status">${svg('shield')} Saved on this device</span>`)}
      <div class="entry-grid">
        <section class="card card-pad">
          <div class="card-heading-row"><div><h2 class="section-heading">Expense details</h2><p class="section-caption">Choose a project and enter the details below.</p></div>${svg('receipt')}</div>
          <form data-form="add-expense" id="addExpenseForm">
            <div class="field-grid">
              <div class="field full"><div class="field-label"><label for="addProject">Project / Client</label><button type="button" class="text-action" data-action="new-project">${svg('plus')} New project</button></div><select class="select" name="projectId" id="addProject" required ${data.projects.length ? '' : 'disabled'}>${optionProjects(selected?.id || '')}</select></div>
              <div class="field"><label class="field-label" for="addDate">Expense date</label><input class="input" type="date" id="addDate" name="date" value="${attr(ui.addDate)}" min="1900-01-01" max="9999-12-31" required ${data.projects.length ? '' : 'disabled'}></div>
              <div class="field"><label class="field-label" for="addAmount">Amount (INR)</label><div class="input-currency"><span class="currency-prefix">₹</span><input class="input" type="number" min="0.01" max="10000000000000" step="0.01" id="addAmount" name="amount" value="${attr(ui.addDraft.amount)}" placeholder="0.00" inputmode="decimal" required ${data.projects.length ? '' : 'disabled'}></div></div>
              <div class="field full"><label class="field-label" for="addDescription">Expense name / Purpose</label><input class="input" id="addDescription" name="description" type="text" maxlength="200" value="${attr(ui.addDraft.description)}" placeholder="e.g. Cement, TMT steel, labour payment" autocomplete="off" required ${data.projects.length ? '' : 'disabled'}></div>
              <div class="field full"><label class="field-label" for="addNotes">Notes <span class="muted">Optional</span></label><textarea class="textarea" id="addNotes" name="notes" maxlength="1000" placeholder="Quantity, supplier, invoice number, or extra details" rows="3" ${data.projects.length ? '' : 'disabled'}>${plain(ui.addDraft.notes)}</textarea></div>
            </div>
            <div class="form-footer"><span class="hint">${svg('info')} The project and date stay selected for your next entry.</span><button type="submit" class="btn btn-primary btn-lg" ${data.projects.length ? '' : 'disabled'}>${svg('plus')} Save expense ${svg('arrow-right')}</button></div>
          </form>
        </section>
        <aside class="right-stack">
          ${selected ? `<section class="card card-pad context-card"><div class="context-kicker">CURRENTLY SELECTED PROJECT</div><h3>${plain(selected.name)}</h3><p class="context-client">${plain(selected.client)}</p><div class="context-amount">${money(total(expenses))}</div><div class="context-desc">Total recorded spending</div><div class="context-bottom"><div><strong>${expenses.length}</strong> entries</div><button class="text-action" data-action="open-project" data-id="${attr(selected.id)}">View project ${svg('arrow-right')}</button></div></section>` : `<section class="card card-pad">${blank('building', 'Start with a project', 'Create a project and client before you record your first expense.', `<button class="btn btn-primary" data-action="new-project">${svg('plus')} Add project</button>`)}</section>`}
          <section class="card card-pad mini-card"><div class="card-heading-row"><div><h2 class="section-heading">Recently added</h2><p class="section-caption">Your latest saved entries</p></div><button class="text-action" data-action="go-expenses">View all ${svg('arrow-right')}</button></div>
          ${last.length ? `<div class="mini-list">${last.map(exp => {const p = findProject(exp.projectId); return `<div class="mini-item"><div class="mini-icon">${svg('receipt')}</div><div class="mini-main"><strong>${plain(exp.description)}</strong><small>${plain(p?.name || '')} · ${readableDate(exp.date)}</small></div><div class="mini-money">${money(exp.amount)}</div></div>`;}).join('')}</div>` : '<p class="empty-mini">No expenses yet. Your latest entries will appear here as you add them.</p>'}</section>
          <div class="card info-card"><div class="info-top">${svg('calendar')} Backdated entries? No problem.</div><p>You can enter January expenses in September. SiteLedger places them in the correct month automatically, even when added later.</p></div>
        </aside>
      </div>`;
  }

  function renderProjects() {
    const query = ui.projectListSearch.trim().toLowerCase();
    const matched = data.projects.filter(p => `${p.name} ${p.client} ${p.location}`.toLowerCase().includes(query));
    const cards = matched.map(p => {
      const expenses = projectExpenses(p.id);
      return `<article class="card project-card" data-action="open-project" data-id="${attr(p.id)}" tabindex="0" role="button" aria-label="View ${attr(p.name)} expenses">
        <div class="project-top"><div class="project-icon">${svg('building')}</div><span class="project-active">Project</span></div>
        <h2 class="project-title">${plain(p.name)}</h2><p class="project-client">${plain(p.client)}${p.location ? ` · ${plain(p.location)}` : ''}</p>
        <div class="project-money">${money(total(expenses))}</div><div class="project-money-label">TOTAL SPENDING</div>
        <div class="project-bottom"><span class="project-meta">${expenses.length} ${expenses.length === 1 ? 'expense' : 'expenses'} recorded</span><span class="project-arrow">${svg('arrow-right')}</span></div>
      </article>`;
    }).join('');
    return `${formatHeader('YOUR WORKSPACE', 'Projects', 'All your sites and clients, organized in one place.', `<button class="btn btn-primary" data-action="new-project">${svg('plus')} New project</button>`)}
      <div class="projects-toolbar"><form class="search-form" data-form="search-projects"><div class="search-field">${svg('search')}<input class="input" name="query" value="${attr(ui.projectListSearch)}" placeholder="Search project or client" aria-label="Search projects"></div><button class="btn btn-outline" type="submit">Search</button></form><span class="result-count">${matched.length} of ${data.projects.length} projects</span></div>
      ${matched.length ? `<div class="projects-grid">${cards}</div>` : `<div class="card">${blank('building', data.projects.length ? 'No matching projects' : 'Create your first project', data.projects.length ? 'Try a different project or client name.' : 'Set up a project and client to start recording expenses.', data.projects.length ? '<button class="btn btn-outline" data-action="clear-project-search">Clear search</button>' : `<button class="btn btn-primary" data-action="new-project">${svg('plus')} Create a project</button>`)}</div>`}`;
  }

  function renderProjectDetail() {
    const p = findProject(ui.projectId);
    if (!p) { ui.route = 'projects'; return renderProjects(); }
    const expenses = projectExpenses(p.id);
    const filtered = expenses.filter(exp => (ui.projectYear === 'all' || exp.date.startsWith(ui.projectYear + '-')) && (`${exp.description} ${exp.notes}`.toLowerCase().includes(ui.projectSearch.trim().toLowerCase())));
    return `<button class="back-link" data-action="go-projects">${svg('arrow-left')} All projects</button>
    <div class="project-detail-header"><div><div class="eyebrow">PROJECT ACCOUNT</div><h1 class="page-title">${plain(p.name)}</h1><div class="detail-meta"><span>${svg('building')} ${plain(p.client)}</span>${p.location ? `<span>${svg('map-pin')} ${plain(p.location)}</span>` : ''}${p.startDate ? `<span>${svg('calendar')} Started ${readableDate(p.startDate)}</span>` : ''}</div></div><div class="header-actions"><button class="btn btn-outline" data-action="edit-project" data-id="${attr(p.id)}">${svg('pencil')} Edit project</button><button class="btn btn-primary" data-action="add-for-project" data-id="${attr(p.id)}">${svg('plus')} Add expense</button><div class="detail-menu"><button class="icon-button" data-action="toggle-project-menu" aria-label="Project options" aria-expanded="false">${svg('more')}</button><div id="projectMenu" class="dropdown-menu" hidden><button data-action="download-project-csv" data-id="${attr(p.id)}">${svg('download')} Export CSV</button><button class="danger-text" data-action="request-delete-project" data-id="${attr(p.id)}">${svg('trash')} Delete project</button></div></div></div></div>
    <div class="stats-grid">${stat('Total expenses', money(total(expenses)), 'All recorded years', 'wallet')}${stat('Entries', String(expenses.length), 'Saved expense records', 'receipt')}${stat('Months tracked', String(new Set(expenses.map(e => e.date.slice(0,7))).size), 'Distinct months', 'calendar')}${stat('Latest entry', expenses.length ? readableDate(sortedExpenses(expenses, 'desc')[0].date) : '—', 'By expense date', 'trending')}</div>
    <section class="card card-pad"><div class="expenses-head"><div><h2 class="section-heading">Expense register</h2><p class="section-caption">Automatically organized by expense month. Edit entries any time.</p></div><span class="result-count">${filtered.length} of ${expenses.length} entries</span></div>
    <div class="list-toolbar"><form data-form="search-project-expenses" class="search-form"><div class="search-field">${svg('search')}<input class="input" name="query" value="${attr(ui.projectSearch)}" placeholder="Search an expense" aria-label="Search expenses"></div><button class="btn btn-outline" type="submit">Search</button></form><div class="filter-set"><select class="select filter-select" data-filter="projectYear" aria-label="Filter by year">${yearSelect(expenses, ui.projectYear)}</select><select class="select filter-select" data-filter="projectSort" aria-label="Sort expenses"><option value="asc" ${ui.projectSort === 'asc' ? 'selected' : ''}>Oldest first</option><option value="desc" ${ui.projectSort === 'desc' ? 'selected' : ''}>Newest first</option></select></div></div>
    ${filtered.length ? renderGroupedTable(sortedExpenses(filtered, ui.projectSort), false) : blank('receipt', expenses.length ? 'No matching expenses' : 'No expenses recorded', expenses.length ? 'Try changing your filters or search.' : 'Start adding cement, steel, labour, and other project expenses.', `<button class="btn btn-primary" data-action="add-for-project" data-id="${attr(p.id)}">${svg('plus')} Add expense</button>`)}
    ${filtered.length ? `<div class="list-summary"><span>Total for displayed entries</span><strong>${money(total(filtered))}</strong></div>` : ''}
    </section>`;
  }

  function renderAllExpenses() {
    const filtered = data.expenses.filter(exp =>
      (ui.expenseProject === 'all' || exp.projectId === ui.expenseProject) &&
      (ui.expenseYear === 'all' || exp.date.startsWith(ui.expenseYear + '-')) &&
      `${exp.description} ${exp.notes} ${findProject(exp.projectId)?.name || ''} ${findProject(exp.projectId)?.client || ''}`.toLowerCase().includes(ui.expenseSearch.trim().toLowerCase())
    );
    return `${formatHeader('MASTER REGISTER', 'All expenses', 'One complete, date-sorted register across all your projects.', `<button class="btn btn-primary" data-action="go-add">${svg('plus')} Add expense</button>`)}
    <section class="card card-pad"><div class="expenses-head"><div><h2 class="section-heading">Expense history</h2><p class="section-caption">The serial numbers always follow the order shown on screen.</p></div><button class="btn btn-outline btn-sm" data-action="download-all-csv">${svg('download')} Export CSV</button></div>
    <div class="list-toolbar"><form data-form="search-all-expenses" class="search-form"><div class="search-field">${svg('search')}<input class="input" name="query" value="${attr(ui.expenseSearch)}" placeholder="Search expenses or clients" aria-label="Search all expenses"></div><button class="btn btn-outline" type="submit">Search</button></form><div class="filter-set"><select class="select filter-select" data-filter="expenseProject" aria-label="Filter project">${optionProjects(ui.expenseProject, true)}</select><select class="select filter-select" data-filter="expenseYear" aria-label="Filter year">${yearSelect(data.expenses, ui.expenseYear)}</select><select class="select filter-select" data-filter="expenseSort" aria-label="Sort expenses"><option value="asc" ${ui.expenseSort === 'asc' ? 'selected' : ''}>Oldest first</option><option value="desc" ${ui.expenseSort === 'desc' ? 'selected' : ''}>Newest first</option></select></div></div>
    ${filtered.length ? renderGroupedTable(sortedExpenses(filtered, ui.expenseSort), true) : blank('receipt', data.expenses.length ? 'No matching expenses' : 'Your register is empty', data.expenses.length ? 'Try clearing search terms or filters.' : 'Add an expense to see your records sorted by year and month.', `<button class="btn btn-primary" data-action="go-add">${svg('plus')} Add expense</button>`)}
    ${filtered.length ? `<div class="list-summary"><span>${filtered.length} entries · Displayed total</span><strong>${money(total(filtered))}</strong></div>` : ''}
    </section>`;
  }

  function renderGroupedTable(expenses, includeProject) {
    const buckets = new Map();
    expenses.forEach((exp, index) => {
      const key = exp.date.slice(0,7);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ exp, number: index + 1 });
    });
    return [...buckets.entries()].map(([key, items]) => {
      const [year, month] = key.split('-').map(Number);
      const subtotal = total(items.map(item => item.exp));
      return `<div class="month-block"><div class="month-heading"><div class="month-title">${svg('calendar')} ${MONTHS[month - 1]} ${year} <span class="month-count">· ${items.length} ${items.length === 1 ? 'entry' : 'entries'}</span></div><div class="month-total">${money(subtotal)}</div></div>
      <div class="table-scroll"><table class="expense-table"><thead><tr><th scope="col">S.No</th><th scope="col">Expense name / Purpose</th>${includeProject ? '<th scope="col">Project / Client</th>' : ''}<th scope="col">Date</th><th scope="col" class="text-right">Amount</th><th scope="col" aria-label="Actions"></th></tr></thead>
      <tbody>${items.map(({exp, number}) => {const project = findProject(exp.projectId); return `<tr><td class="cell-no">${String(number).padStart(2, '0')}</td><td class="cell-expense">${plain(exp.description)}${exp.notes ? `<small>${plain(exp.notes)}</small>` : ''}</td>${includeProject ? `<td class="cell-project">${plain(project?.name || 'Unknown')}<br><small>${plain(project?.client || '')}</small></td>` : ''}<td class="cell-date">${readableDate(exp.date)}</td><td class="cell-amount">${money(exp.amount)}</td><td class="cell-actions"><button class="row-btn" data-action="edit-expense" data-id="${attr(exp.id)}" title="Edit expense" aria-label="Edit ${attr(exp.description)}">${svg('pencil')}</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
    }).join('');
  }

  function renderOverview() {
    const lastSix = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
      lastSix.push({ key, name: MONTHS[date.getMonth()].slice(0,3), amount: total(data.expenses.filter(e => e.date.startsWith(key))) });
    }
    const maximum = Math.max(1, ...lastSix.map(m => m.amount));
    const projectRanks = data.projects.map(p => ({p, spend:total(projectExpenses(p.id)), count:projectExpenses(p.id).length})).sort((a,b) => b.spend-a.spend);
    const mostRecent = createdRecently(data.expenses, 6);
    return `${formatHeader('AT A GLANCE', 'Overview', `Your ${plain(data.settings.businessName)} expense dashboard, across every client.`, `<button class="btn btn-primary" data-action="go-add">${svg('plus')} New expense</button>`)}
    <div class="stats-grid">${stat('Total spending', money(total(data.expenses)), 'Across all recorded years', 'wallet')}${stat('Projects', String(data.projects.length), 'Registered client projects', 'building')}${stat('Expense entries', String(data.expenses.length), 'Individual transactions', 'receipt')}${stat('This month', money(total(data.expenses.filter(e => e.date.startsWith(nowMonth)))), 'Current calendar month', 'calendar')}</div>
    <div class="overview-grid"><section class="card card-pad"><div class="card-heading-row"><div><h2 class="section-heading">Spending by month</h2><p class="section-caption">Last six calendar months · Based on expense dates</p></div>${svg('trending')}</div><div class="chart-wrap">${lastSix.map((m,i) => `<div class="bar-slot"><div class="bar-visual ${i === 5 ? 'strong' : ''}" style="height:${Math.max(2, (m.amount/maximum)*82)}%" data-tip="${attr(money(m.amount))}" title="${attr(money(m.amount))}"></div><div class="bar-name">${m.name}</div></div>`).join('')}</div><p class="chart-foot">Older expenses are still included in project and total spending, even if they are outside this chart.</p></section>
    <section class="card card-pad"><div class="card-heading-row"><div><h2 class="section-heading">Spending by project</h2><p class="section-caption">Where costs are going</p></div></div>${projectRanks.length ? projectRanks.slice(0,6).map((r,i) => `<div class="rank-item"><div class="rank-num">${String(i+1).padStart(2,'0')}</div><div class="rank-main"><strong>${plain(r.p.name)}</strong><small>${r.count} entries</small><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, total(data.expenses) ? r.spend / total(data.expenses) * 100 : 0)}%"></div></div></div><div class="rank-money">${money(r.spend)}</div></div>`).join('') : `<p class="empty-mini">Projects appear here as you create them.</p>`}</section></div>
    <section class="card card-pad" style="margin-top:20px"><div class="card-heading-row"><div><h2 class="section-heading">Latest activity</h2><p class="section-caption">Most recently recorded, regardless of expense date</p></div><button class="text-action" data-action="go-expenses">All expenses ${svg('arrow-right')}</button></div>${mostRecent.length ? `<div class="mini-list">${mostRecent.map(exp => `<div class="mini-item"><div class="mini-icon">${svg('receipt')}</div><div class="mini-main"><strong>${plain(exp.description)}</strong><small>${plain(findProject(exp.projectId)?.name || '')} · ${readableDate(exp.date)}</small></div><div class="mini-money">${money(exp.amount)}</div></div>`).join('')}</div>` : `<p class="empty-mini">No activity yet. Start with your first project and expense.</p>`}</section>`;
  }

  function renderSettings() {
    return `${formatHeader('WORKSPACE OPTIONS', 'Settings & backups', 'Personalize your workspace and keep a safe copy of your records.', `<span class="head-status">${svg('lock')} No account required</span>`)}
    <div class="settings-grid">
      <section class="card settings-card settings-full"><div class="settings-card-header"><div class="settings-icon">${svg('building')}</div><div><h2 class="section-heading">Business information</h2><p class="section-caption">Update the business name shown on your dashboard.</p></div></div><form data-form="business-name"><div class="field" style="max-width:480px"><label class="field-label" for="businessName">Business name</label><input class="input" name="businessName" id="businessName" maxlength="100" value="${attr(data.settings.businessName)}" required></div><div style="margin-top:17px"><button class="btn btn-primary" type="submit">${svg('check')} Save changes</button></div></form></section>
      <section class="card settings-card"><div class="settings-card-header"><div class="settings-icon">${svg('download')}</div><div><h2 class="section-heading">Export backup</h2><p class="section-caption">Download everything as one JSON file.</p></div></div><p>Your backup includes every project, client, expense, date, and business setting. Save it to your computer, a USB drive, or cloud storage.</p><div class="settings-info"><strong>${data.projects.length} projects</strong> and <strong>${data.expenses.length} expense entries</strong> ready to export.</div><button class="btn btn-primary" data-action="export-json">${svg('download')} Download JSON backup</button></section>
      <section class="card settings-card"><div class="settings-card-header"><div class="settings-icon">${svg('upload')}</div><div><h2 class="section-heading">Import / Restore</h2><p class="section-caption">Move records from another computer.</p></div></div><p>Select a SiteLedger JSON backup file to restore your data here. You will review it and confirm before your current records are replaced.</p><div class="settings-info"><strong>Important:</strong> restoring a backup replaces the records stored in this browser. Export your current data first if you want to keep a copy.</div><button class="btn btn-outline" data-action="choose-json">${svg('upload')} Choose JSON file</button></section>
      <div class="backup-tip settings-full">${svg('shield')} <strong>A note about local storage:</strong> This app works without a login or database. Data is saved in this browser on this device; it does not automatically sync to other devices. Deleting browser site data can erase it. Export JSON backups regularly.</div>
      <section class="card settings-card settings-danger settings-full"><div class="settings-card-header"><div class="settings-icon">${svg('alert')}</div><div><h2 class="section-heading">Danger zone</h2><p class="section-caption">Irreversible actions are locked behind typed confirmation.</p></div></div><p>Delete all projects and expense entries stored in this browser. You will need to type <strong>DELETE</strong> or <strong>ERASE</strong> to proceed. This cannot be undone without a backup.</p><button class="btn btn-danger-outline" data-action="request-clear-all">${svg('trash')} Delete all local records</button></section>
    </div>`;
  }

  function modalFrame(title, subtitle, body, footer, kicker = 'SITELEDGER', wide = false) {
    $('#modalRoot').innerHTML = `<div class="modal-backdrop" data-modal-backdrop="true"><section class="modal ${wide ? 'modal-large' : ''}" role="dialog" aria-modal="true" aria-label="${attr(title)}"><div class="modal-header"><div><div class="modal-kicker">${plain(kicker)}</div><h2 class="modal-title">${plain(title)}</h2><p class="modal-subtitle">${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close dialog">${svg('x')}</button></div>${body}${footer}</section></div>`;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#modalRoot input:not([type="hidden"]), #modalRoot select')?.focus(), 10);
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; document.body.style.overflow = ''; backupPending = null; }

  function showProjectModal(projectId = '') {
    const p = findProject(projectId);
    const editing = !!p;
    const body = `<form id="projectForm" data-form="project" class="modal-body"><input type="hidden" name="id" value="${attr(p?.id || '')}"><div class="field-grid"><div class="field full"><label class="field-label" for="projectName">Project name</label><input class="input" id="projectName" name="name" required maxlength="160" value="${attr(p?.name || '')}" placeholder="e.g. Residential Villa — Phase 1"></div><div class="field full"><label class="field-label" for="projectClient">Client name</label><input class="input" id="projectClient" name="client" required maxlength="160" value="${attr(p?.client || '')}" placeholder="e.g. Ahmed K."></div><div class="field"><label class="field-label" for="projectLocation">Location <span class="muted">Optional</span></label><input class="input" id="projectLocation" name="location" maxlength="200" value="${attr(p?.location || '')}" placeholder="e.g. Kannur"></div><div class="field"><label class="field-label" for="projectStartDate">Start date <span class="muted">Optional</span></label><input class="input" id="projectStartDate" name="startDate" type="date" value="${attr(p?.startDate || '')}"></div></div></form>`;
    const footer = `<div class="modal-footer"><button class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" form="projectForm" class="btn btn-primary">${svg('check')} ${editing ? 'Save project' : 'Create project'}</button></div>`;
    modalFrame(editing ? 'Edit project' : 'Create a project', 'Keep project and client information together.', body, footer, 'PROJECT DETAILS');
  }

  function showExpenseModal(expenseId) {
    const exp = findExpense(expenseId);
    if (!exp) return toast('Expense not found.', true);
    const body = `<form class="modal-body" id="editExpenseForm" data-form="edit-expense"><input name="id" type="hidden" value="${attr(exp.id)}"><div class="field-grid"><div class="field full"><label class="field-label" for="editExpenseProject">Project / Client</label><select class="select" name="projectId" id="editExpenseProject" required>${optionProjects(exp.projectId)}</select></div><div class="field"><label class="field-label" for="editExpenseDate">Date</label><input class="input" id="editExpenseDate" name="date" type="date" value="${attr(exp.date)}" required></div><div class="field"><label class="field-label" for="editExpenseAmount">Amount (INR)</label><input class="input" id="editExpenseAmount" name="amount" type="number" min="0.01" step="0.01" max="10000000000000" value="${attr(exp.amount)}" required></div><div class="field full"><label class="field-label" for="editExpenseDescription">Expense name / Purpose</label><input class="input" id="editExpenseDescription" name="description" maxlength="200" value="${attr(exp.description)}" required></div><div class="field full"><label class="field-label" for="editExpenseNotes">Notes <span class="muted">Optional</span></label><textarea class="textarea" id="editExpenseNotes" name="notes" maxlength="1000" rows="3">${plain(exp.notes)}</textarea></div></div></form>`;
    const footer = `<div class="modal-footer" style="justify-content:space-between"><button class="btn btn-danger-outline btn-sm" data-action="request-delete-expense" data-id="${attr(exp.id)}">${svg('trash')} Delete...</button><div class="inline-actions"><button class="btn btn-outline" data-action="close-modal">Cancel</button><button class="btn btn-primary" form="editExpenseForm" type="submit">${svg('check')} Save changes</button></div></div>`;
    modalFrame('Edit expense', 'Correct an entry without losing its original place in the register.', body, footer, 'EXPENSE DETAILS', true);
  }

  function showDeletionModal(type, targetId = '') {
    let label, explanation;
    if (type === 'expense') {
      const exp = findExpense(targetId);
      if (!exp) return;
      label = `expense “${exp.description}”`;
      explanation = 'This will permanently remove one expense entry.';
    } else if (type === 'project') {
      const p = findProject(targetId);
      if (!p) return;
      label = `project “${p.name}”`;
      explanation = `This will also permanently remove its ${projectExpenses(p.id).length} linked expense entries.`;
    } else {
      label = 'ALL locally stored records';
      explanation = `This removes ${data.projects.length} projects and ${data.expenses.length} expense entries from this browser.`;
    }
    const body = `<form id="deleteForm" data-form="delete-confirm" class="modal-body"><input type="hidden" name="type" value="${attr(type)}"><input type="hidden" name="targetId" value="${attr(targetId)}"><div class="danger-note">${svg('alert')} You are deleting <strong>${plain(label)}</strong>. ${plain(explanation)}<br>Make sure you have a JSON backup if you might need these records later.</div><div class="field"><label class="field-label" for="deleteWord">Type <span class="code-word">DELETE</span> or <span class="code-word">ERASE</span> to confirm</label><input class="input" id="deleteWord" name="confirm" placeholder="Type DELETE or ERASE" required autocomplete="off"></div><p class="validation-note" id="deleteHint" hidden>Enter exactly DELETE or ERASE to continue.</p></form>`;
    const footer = `<div class="modal-footer"><button class="btn btn-outline" data-action="close-modal">Cancel</button><button type="submit" form="deleteForm" class="btn btn-danger">${svg('trash')} Permanently delete</button></div>`;
    modalFrame('Confirm deletion', 'This action cannot be undone without a backup.', body, footer, 'PROTECTED ACTION');
  }

  function showImportConfirm(backup, filename) {
    backupPending = backup;
    const body = `<form id="restoreForm" data-form="restore" class="modal-body"><div class="settings-info" style="margin-top:0"><strong>File:</strong> ${plain(filename)}<br><strong>Projects:</strong> ${backup.projects.length}<br><strong>Expenses:</strong> ${backup.expenses.length}<br><strong>Business:</strong> ${plain(backup.settings.businessName)}</div><div class="danger-note">${svg('alert')} Restoring this backup replaces <strong>${data.projects.length} current projects</strong> and <strong>${data.expenses.length} current expenses</strong> in this browser. Export a backup of your current records first if needed.</div><div class="field"><label class="field-label" for="restoreWord">Type <span class="code-word">RESTORE</span> to continue</label><input class="input" name="confirm" id="restoreWord" placeholder="RESTORE" required autocomplete="off"></div><p class="validation-note" id="restoreHint" hidden>Type RESTORE to continue.</p></form>`;
    const footer = `<div class="modal-footer"><button class="btn btn-outline" data-action="close-modal">Cancel</button><button class="btn btn-primary" form="restoreForm" type="submit">${svg('upload')} Restore backup</button></div>`;
    modalFrame('Restore from backup', 'Review the records before replacing your local workspace.', body, footer, 'IMPORT JSON');
  }

  function getFormValues(form) {
    const fd = new FormData(form);
    return Object.fromEntries(fd.entries());
  }
  function checkExpenseValues(v) {
    const amount = Number(v.amount);
    if (!findProject(v.projectId)) { toast('Choose a valid project.', true); return null; }
    if (!isDate(v.date)) { toast('Please choose a valid expense date.', true); return null; }
    if (!String(v.description || '').trim()) { toast('Enter an expense name.', true); return null; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e13) { toast('Enter a valid positive amount.', true); return null; }
    return { projectId: v.projectId, date: v.date, amount: Math.round(amount * 100) / 100, description: v.description.trim().slice(0,200), notes: String(v.notes || '').trim().slice(0,1000) };
  }

  function handleSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const name = form.dataset.form;
    const v = getFormValues(form);
    if (name === 'add-expense') {
      const values = checkExpenseValues(v);
      if (!values) return;
      const expense = {...values, id:id(), createdAt:new Date().toISOString(), updatedAt:''};
      if (persist({...data, expenses:[...data.expenses, expense]}, 'Expense saved successfully.')) {
        ui.addProjectId = values.projectId; ui.addDate = values.date; ui.addDraft = {amount:'',description:'',notes:''};
        renderView(); $('#addDescription')?.focus();
      }
    } else if (name === 'project') {
      const projectId = String(v.id || '');
      const project = findProject(projectId);
      if (!v.name.trim() || !v.client.trim()) {toast('Project and client names are required.', true);return;}
      if (v.startDate && !isDate(v.startDate)) {toast('Please enter a valid start date.', true);return;}
      const obj = {id:project?.id || id(), name:v.name.trim().slice(0,160), client:v.client.trim().slice(0,160), location:v.location.trim().slice(0,200), startDate:v.startDate || '', createdAt:project?.createdAt || new Date().toISOString()};
      const updated = project ? data.projects.map(p => p.id === project.id ? obj : p) : [...data.projects, obj];
      if (persist({...data, projects:updated}, project ? 'Project updated.' : 'Project created.')) {
        if (!project && ui.route === 'add') ui.addProjectId = obj.id;
        closeModal(); renderView();
      }
    } else if (name === 'edit-expense') {
      const current = findExpense(v.id);
      const values = checkExpenseValues(v);
      if (!current || !values) return;
      if (persist({...data, expenses:data.expenses.map(e => e.id === current.id ? {...e,...values,updatedAt:new Date().toISOString()} : e)}, 'Expense updated.')) { closeModal(); renderView(); }
    } else if (name === 'business-name') {
      const businessName = String(v.businessName || '').trim().slice(0,100);
      if (!businessName) return toast('Enter your business name.', true);
      if (persist({...data,settings:{...data.settings,businessName}},'Business name saved.')) renderView();
    } else if (name === 'delete-confirm') {
      if (!['DELETE','ERASE'].includes(String(v.confirm || '').trim().toUpperCase())) { $('#deleteHint').hidden = false; return; }
      let next = data;
      if (v.type === 'expense') next = {...data,expenses:data.expenses.filter(e => e.id !== v.targetId)};
      else if (v.type === 'project') next = {...data,projects:data.projects.filter(p => p.id !== v.targetId),expenses:data.expenses.filter(e => e.projectId !== v.targetId)};
      else if (v.type === 'all') next = defaultData();
      else return;
      if (persist(next,'Records deleted.')) {
        if (v.type === 'project' || v.type === 'all') ui.route = v.type === 'all' ? 'add' : 'projects';
        if (v.type === 'all') {ui.addProjectId = '';ui.addDate = today();ui.addDraft={amount:'',description:'',notes:''};}
        closeModal(); renderView();
      }
    } else if (name === 'restore') {
      if (String(v.confirm || '').trim().toUpperCase() !== 'RESTORE') { $('#restoreHint').hidden = false; return; }
      if (!backupPending) return toast('No backup selected.', true);
      if (persist(backupPending, 'Backup restored successfully.')) {
        ui.route='add';ui.addProjectId='';ui.projectId='';ui.projectSearch='';ui.expenseSearch='';ui.expenseProject='all';ui.expenseYear='all';ui.projectYear='all';ui.addDate=today();ui.addDraft={amount:'',description:'',notes:''};
        closeModal();renderView();
      }
    } else if (name === 'search-projects') {
      ui.projectListSearch = v.query || '';renderView();
    } else if (name === 'search-project-expenses') {
      ui.projectSearch = v.query || '';renderView();
    } else if (name === 'search-all-expenses') {
      ui.expenseSearch = v.query || '';renderView();
    }
  }

  function slug(str) { return String(str).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40) || 'backup'; }
  function download(name, value, type) {
    const blob = new Blob([value], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function exportJson() {
    const backup = {...data,format:BACKUP_FORMAT,exportedAt:new Date().toISOString()};
    download(`siteledger-backup-${today()}.json`, JSON.stringify(backup,null,2), 'application/json;charset=utf-8');
    toast('JSON backup downloaded.');
  }
  const csvField = raw => {
    let value = String(raw ?? '');
    if (/^[\s]*[=+@-]/.test(value)) value = "'" + value;
    return `"${value.replace(/"/g,'""')}"`;
  };
  function exportCsv(projectId = '') {
    const project = projectId ? findProject(projectId) : null;
    const items = sortedExpenses(project ? projectExpenses(project.id) : data.expenses);
    const lines = [['S.No','Expense','Project','Client','Amount (INR)','Date','Notes'].map(csvField).join(',')];
    items.forEach((exp,i) => { const p = findProject(exp.projectId); lines.push([i+1,exp.description,p?.name || '',p?.client || '',exp.amount.toFixed(2),exp.date,exp.notes].map(csvField).join(',')); });
    download(`${project ? slug(project.name)+'-' : ''}expenses-${today()}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV expense report downloaded.');
  }

  function toast(message, error = false) {
    const host = $('#toastStack');
    const item = document.createElement('div');
    item.className = `toast${error ? ' error' : ''}`;
    item.innerHTML = `${svg(error ? 'alert' : 'check')}<span>${plain(message)}</span>`;
    host.append(item);
    setTimeout(() => item.remove(), 4300);
  }

  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#mobileShade').classList.remove('open'); }
  function handleClick(event) {
    if (event.target.dataset.modalBackdrop === 'true') {closeModal();return;}
    const nav = event.target.closest('button[data-route]');
    if (nav) {navigate(nav.dataset.route);return;}
    const clicked = event.target.closest('[data-action]');
    if (!clicked) {
      if (!event.target.closest('.detail-menu')) {const menu = $('#projectMenu');if (menu) menu.hidden=true;}
      return;
    }
    const action = clicked.dataset.action;
    const targetId = clicked.dataset.id || '';
    switch(action) {
      case 'new-project': showProjectModal();break;
      case 'edit-project':showProjectModal(targetId);break;
      case 'open-project':navigate('project',targetId);break;
      case 'go-projects':navigate('projects');break;
      case 'go-expenses':navigate('expenses');break;
      case 'go-add':navigate('add');break;
      case 'add-for-project':navigate('add',targetId);break;
      case 'edit-expense':showExpenseModal(targetId);break;
      case 'close-modal':closeModal();break;
      case 'toggle-project-menu': {const menu=$('#projectMenu');if(menu){menu.hidden=!menu.hidden;clicked.setAttribute('aria-expanded',String(!menu.hidden));}break;}
      case 'request-delete-project':showDeletionModal('project',targetId);break;
      case 'request-delete-expense':showDeletionModal('expense',targetId);break;
      case 'request-clear-all':showDeletionModal('all');break;
      case 'export-json':exportJson();break;
      case 'download-all-csv':exportCsv();break;
      case 'download-project-csv':exportCsv(targetId);break;
      case 'choose-json': {const input=$('#importFile');input.value='';input.click();break;}
      case 'clear-project-search':ui.projectListSearch='';renderView();break;
    }
  }

  async function handleFileImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast('Backup is too large (20 MB maximum).', true);
    try {
      const raw = JSON.parse(await file.text());
      if (raw.format !== BACKUP_FORMAT) return toast('This does not look like a SiteLedger backup.', true);
      const checked = validateData(raw);
      if (!checked) return toast('Backup data is invalid or not supported.', true);
      showImportConfirm(checked, file.name);
    } catch (error) {
      console.error('Import failed:',error);
      toast('Could not read this JSON file. Check that it is a valid backup.', true);
    }
  }

  document.addEventListener('submit',handleSubmit);
  document.addEventListener('click',handleClick);
  document.addEventListener('input', event => {
    const mapping = {addAmount:'amount',addDescription:'description',addNotes:'notes'};
    const key = mapping[event.target.id];
    if (key) ui.addDraft[key] = event.target.value;
  });
  document.addEventListener('change',event => {
    const el = event.target;
    if (el.id === 'importFile') {handleFileImport(event);return;}
    if (el.dataset.filter && Object.hasOwn(ui,el.dataset.filter)) {
      ui[el.dataset.filter] = el.value;renderView();return;
    }
    if (el.id === 'addProject') {ui.addProjectId=el.value;ui.addDate=$('#addDate')?.value || today();renderView();return;}
    if (el.id === 'addDate') ui.addDate=el.value;
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape') {closeModal();closeSidebar();const menu=$('#projectMenu');if(menu)menu.hidden=true;}
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.project-card')) {event.preventDefault();navigate('project',event.target.dataset.id);}
  });
  $('#openSidebar').addEventListener('click', () => {$('#sidebar').classList.add('open');$('#mobileShade').classList.add('open');});
  $('#mobileShade').addEventListener('click',closeSidebar);
  showStorageWarning();renderView();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline installation unavailable:',error)));
  }
})();
