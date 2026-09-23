let currentProjectId = null;
let projectsCache = [];

const STEP_LABELS = [
  '', 'Mise en forme du besoin', 'Études capacités & investissement', 'GO / NO GO',
  'Recherche composants', 'Fabrication / Prototypage', 'Tests de conformité',
  'Livraison DG', 'Archivage → R2 Vente'
];

function $(id) { return document.getElementById(id); }

function showView(name) {
  document.querySelectorAll('[id^="view-"]').forEach((el) => el.classList.add('hidden'));
  const el = $(`view-${name}`);
  if (el) el.classList.remove('hidden');
  document.querySelectorAll('.sidebar-item').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === name);
    a.classList.toggle('text-slate-600', a.dataset.view !== name);
  });
  if (name === 'dashboard') renderDashboard();
  if (name === 'processus') renderProcessus();
  if (name === 'taches') renderTasks();
  if (name === 'stocks') renderStocks();
  if (name === 'documents') renderDocuments();
  if (name === 'equipe') renderEquipe();
  lucide.createIcons();
}

async function boot() {
  lucide.createIcons();
  document.querySelectorAll('.sidebar-item').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showView(a.dataset.view);
    });
  });

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-error').classList.add('hidden');
    try {
      const data = await API.post('/auth/login', {
        email: $('login-email').value,
        password: $('login-password').value
      });
      API.setAuth(data.token, data.user);
      await enterApp();
    } catch (err) {
      $('login-error').textContent = err.message;
      $('login-error').classList.remove('hidden');
    }
  });

  if (API.token) {
    try {
      await API.get('/auth/me');
      await enterApp();
    } catch {
      API.logout();
    }
  }
}

async function enterApp() {
  $('login-screen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('user-name').textContent = API.user.full_name;
  $('user-avatar').textContent = API.user.initials || '?';
  await refreshProjects();
  showView('dashboard');
  loadNotifications();
  lucide.createIcons();
}

async function refreshProjects() {
  const { projects } = await API.get('/projects');
  projectsCache = projects;
  const sel = $('project-select');
  sel.innerHTML = projects.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  if (!currentProjectId && projects.length) currentProjectId = projects[0].id;
  if (currentProjectId) sel.value = currentProjectId;
  sel.onchange = () => {
    currentProjectId = Number(sel.value);
    const active = document.querySelector('.sidebar-item.active');
    showView(active ? active.dataset.view : 'dashboard');
  };
}

async function loadNotifications() {
  try {
    const { unread } = await API.get('/notifications');
    $('notif-dot').classList.toggle('hidden', !unread);
  } catch { /* ignore */ }
}

async function renderDashboard() {
  const stats = await API.get('/projects/stats');
  const { projects } = await API.get('/projects');
  const { notifications } = await API.get('/notifications');

  $('view-dashboard').innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">Tableau de bord</h2>
        <p class="text-slate-500 text-sm mt-1">Vue d'ensemble des projets de conception</p>
      </div>
      <button onclick="createProject()" class="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg">+ Nouveau projet</button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${kpi('Projets actifs', stats.projects_active)}
      ${kpi('Tâches en cours', stats.tasks_open)}
      ${kpi('Validations en attente', stats.validations_pending)}
      ${kpi('Budget engagé', (stats.budget_spent / 1000).toFixed(1) + 'k€')}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-semibold mb-4">Projets</h3>
        <div class="space-y-3">
          ${projects.map((p) => `
            <div class="border border-slate-100 rounded-lg p-4 cursor-pointer hover:border-violet-200" onclick="currentProjectId=${p.id};$('project-select').value=${p.id};showView('processus')">
              <div class="flex justify-between">
                <div>
                  <span class="font-medium">${esc(p.name)}</span>
                  <span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-violet-100 text-violet-700">${STEP_LABELS[p.current_step] || p.status}</span>
                </div>
                <span class="text-sm text-slate-500">${Math.round((p.current_step / 8) * 100)}%</span>
              </div>
              <div class="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full bg-violet-500 rounded-full" style="width:${(p.current_step / 8) * 100}%"></div>
              </div>
              <p class="text-xs text-slate-500 mt-2">${p.owner_name || '—'} · ${p.member_count || 0} membres · ${p.doc_count || 0} docs</p>
            </div>
          `).join('') || '<p class="text-sm text-slate-500">Aucun projet</p>'}
        </div>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="font-semibold mb-4">Notifications</h3>
        <div class="space-y-3">
          ${notifications.slice(0, 8).map((n) => `
            <div class="text-sm">
              <p class="font-medium">${esc(n.title)}</p>
              <p class="text-xs text-slate-500">${esc(n.message || '')} · ${n.created_at}</p>
            </div>
          `).join('') || '<p class="text-sm text-slate-500">Aucune notification</p>'}
        </div>
      </div>
    </div>`;
}

function kpi(label, value) {
  return `<div class="bg-white rounded-xl border border-slate-200 p-5">
    <p class="text-sm text-slate-500">${label}</p>
    <p class="text-3xl font-bold mt-2">${value}</p>
  </div>`;
}

async function createProject() {
  const name = prompt('Nom du projet :');
  if (!name) return;
  await API.post('/projects', { name });
  await refreshProjects();
  showView('dashboard');
}

async function renderProcessus() {
  if (!currentProjectId) {
    $('view-processus').innerHTML = '<p class="text-slate-500">Sélectionnez un projet</p>';
    return;
  }
  const data = await API.get(`/projects/${currentProjectId}`);
  const { project, steps } = data;
  const current = project.current_step;

  $('view-processus').innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">Processus R1b – Conception</h2>
        <p class="text-slate-500 text-sm mt-1">Projet : <span class="font-medium text-slate-700">${esc(project.name)}</span></p>
      </div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 p-6 mb-6 overflow-x-auto">
      <div class="flex items-center min-w-[900px]">
        ${steps.map((s, i) => {
          const done = s.status === 'done';
          const active = s.status === 'in_progress';
          const cls = done ? 'step-done text-white' : active ? 'step-active text-white shadow-lg' : 'bg-slate-200 text-slate-500';
          return `
            ${i > 0 ? `<div class="flex-1 h-1 ${done || active ? 'bg-emerald-500' : 'bg-slate-200'} -mx-1"></div>` : ''}
            <div class="flex flex-col items-center flex-1">
              <div class="w-10 h-10 rounded-full ${cls} flex items-center justify-center text-sm font-bold">${done ? '✓' : s.step_number}</div>
              <p class="text-xs font-medium mt-2 text-center ${active ? 'text-violet-700 font-semibold' : ''}">${esc(s.title)}</p>
            </div>`;
        }).join('')}
      </div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 p-6">
      <h3 class="font-semibold text-lg mb-4">Étape ${current} – ${STEP_LABELS[current] || ''}</h3>
      <textarea id="step-notes" rows="3" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4" placeholder="Notes / résultats..."></textarea>
      <div class="flex flex-wrap gap-3">
        ${current === 3 ? `
          <button onclick="decideStep('GO')" class="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">GO</button>
          <button onclick="decideStep('NO_GO')" class="px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium">NO GO → Archivage</button>
        ` : ''}
        ${current === 6 || current === 7 ? `
          <button onclick="decideStep('CONFORME')" class="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium">✓ Conforme</button>
          <button onclick="decideStep('NON_CONFORME')" class="px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium">✗ Non conforme → Retour</button>
        ` : ''}
        ${current !== 3 && current !== 6 && current !== 7 ? `
          <button onclick="decideStep('DONE')" class="px-4 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium">Valider l'étape</button>
        ` : ''}
      </div>
      ${project.go_decision ? `<p class="mt-4 text-sm text-slate-600">Décision GO/NO GO : <strong>${project.go_decision}</strong> (${project.go_decided_at || ''})</p>` : ''}
    </div>`;
}

async function decideStep(decision) {
  const notes = $('step-notes')?.value || '';
  const body = decision === 'DONE'
    ? { status: 'done', notes }
    : { decision, notes };
  await API.patch(`/projects/${currentProjectId}/steps/${projectsCache.find(p => p.id === currentProjectId)?.current_step || (await API.get(`/projects/${currentProjectId}`)).project.current_step}`, body);
  // refresh current step from server
  const data = await API.get(`/projects/${currentProjectId}`);
  currentProjectId = data.project.id;
  await refreshProjects();
  renderProcessus();
  loadNotifications();
}

async function renderTasks() {
  const q = currentProjectId ? `?project_id=${currentProjectId}` : '';
  const { tasks } = await API.get(`/tasks${q}`);
  const cols = {
    todo: tasks.filter((t) => t.status === 'todo'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    validation: tasks.filter((t) => t.status === 'validation'),
    done: tasks.filter((t) => t.status === 'done')
  };
  const col = (title, list, bg) => `
    <div class="${bg} rounded-xl p-4 min-h-[320px]">
      <div class="flex justify-between mb-3"><h3 class="font-semibold text-sm">${title}</h3><span class="text-xs bg-white/60 px-2 rounded-full">${list.length}</span></div>
      <div class="space-y-2">
        ${list.map((t) => `
          <div class="bg-white p-3 rounded-lg border border-slate-200 text-sm shadow-sm">
            <p class="font-medium">${esc(t.title)}</p>
            <div class="flex justify-between mt-2 text-xs text-slate-500">
              <span>${esc(t.assignee_name || 'Non assigné')}</span>
              <select onchange="updateTaskStatus(${t.id}, this.value)" class="text-xs border rounded px-1">
                ${['todo','in_progress','validation','done'].map((s) => `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  $('view-taches').innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">Gestion des tâches</h2>
        <p class="text-slate-500 text-sm">Tâches individuelles et de groupe</p>
      </div>
      <button onclick="createTask()" class="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg">+ Nouvelle tâche</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      ${col('À faire', cols.todo, 'bg-slate-100')}
      ${col('En cours', cols.in_progress, 'bg-blue-50')}
      ${col('En validation', cols.validation, 'bg-amber-50')}
      ${col('Terminé', cols.done, 'bg-emerald-50')}
    </div>`;
}

async function createTask() {
  if (!currentProjectId) return alert('Sélectionnez un projet');
  const title = prompt('Titre de la tâche :');
  if (!title) return;
  await API.post('/tasks', { project_id: currentProjectId, title, assignee_id: API.user.id });
  renderTasks();
}

async function updateTaskStatus(id, status) {
  await API.patch(`/tasks/${id}`, { status });
  renderTasks();
  loadNotifications();
}

async function renderStocks() {
  const { items, stats } = await API.get('/stocks');
  $('view-stocks').innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">Stocks & Matériel</h2>
        <p class="text-slate-500 text-sm">Composants, pièces détachées et coûts d'achat</p>
      </div>
      <button onclick="addStock()" class="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg">+ Ajouter composant</button>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 border-b"><tr>
          <th class="text-left px-4 py-3">Référence</th>
          <th class="text-left px-4 py-3">Désignation</th>
          <th class="text-left px-4 py-3">Stock</th>
          <th class="text-left px-4 py-3">Seuil</th>
          <th class="text-left px-4 py-3">Coût</th>
          <th class="text-left px-4 py-3">Fournisseur</th>
          <th class="text-left px-4 py-3">Statut</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100">
          ${items.map((i) => {
            const st = i.quantity < i.threshold ? (i.quantity === 0 ? ['Stock bas','bg-red-100 text-red-700'] : ['Attention','bg-amber-100 text-amber-700']) : ['OK','bg-emerald-100 text-emerald-700'];
            return `<tr class="hover:bg-slate-50">
              <td class="px-4 py-3 font-medium">${esc(i.reference)}</td>
              <td class="px-4 py-3">${esc(i.designation)}</td>
              <td class="px-4 py-3">${i.quantity}</td>
              <td class="px-4 py-3">${i.threshold}</td>
              <td class="px-4 py-3">${Number(i.unit_cost).toFixed(2)} €</td>
              <td class="px-4 py-3">${esc(i.supplier || '')}</td>
              <td class="px-4 py-3"><span class="px-2 py-0.5 text-xs rounded-full ${st[1]}">${st[0]}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white rounded-xl border p-5"><p class="text-sm text-slate-500">Valeur stock</p><p class="text-2xl font-bold">${stats.total_value.toFixed(0)} €</p></div>
      <div class="bg-white rounded-xl border p-5"><p class="text-sm text-slate-500">Sous seuil</p><p class="text-2xl font-bold text-red-600">${stats.below_threshold}</p></div>
      <div class="bg-white rounded-xl border p-5"><p class="text-sm text-slate-500">Articles</p><p class="text-2xl font-bold">${stats.count}</p></div>
    </div>`;
}

async function addStock() {
  const reference = prompt('Référence :');
  if (!reference) return;
  const designation = prompt('Désignation :');
  if (!designation) return;
  const quantity = Number(prompt('Quantité :', '0') || 0);
  const unit_cost = Number(prompt('Coût unitaire (€) :', '0') || 0);
  await API.post('/stocks', { reference, designation, quantity, unit_cost, project_id: currentProjectId });
  renderStocks();
}

async function renderDocuments() {
  if (!currentProjectId) {
    $('view-documents').innerHTML = '<p class="text-slate-500">Sélectionnez un projet</p>';
    return;
  }
  const { documents } = await API.get(`/documents?project_id=${currentProjectId}`);
  $('view-documents').innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold">Espace documentaire</h2>
        <p class="text-slate-500 text-sm">Stockage collaboratif</p>
      </div>
      <label class="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg cursor-pointer">
        Importer
        <input type="file" class="hidden" onchange="uploadDoc(this)" />
      </label>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      ${documents.map((d) => `
        <div class="bg-white rounded-xl border border-slate-200 p-5">
          <h4 class="font-medium">${esc(d.original_name)}</h4>
          <p class="text-xs text-slate-500 mt-1">${d.uploader_name || ''} · ${(d.size_bytes/1024).toFixed(0)} Ko · ${d.created_at}</p>
          <a class="text-violet-600 text-sm mt-2 inline-block" href="/uploads/${d.filename}" target="_blank">Ouvrir</a>
        </div>`).join('') || '<p class="text-slate-500">Aucun document</p>'}
    </div>`;
}

async function uploadDoc(input) {
  if (!input.files?.[0] || !currentProjectId) return;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('project_id', currentProjectId);
  const headers = {};
  if (API.token) headers['Authorization'] = `Bearer ${API.token}`;
  const res = await fetch('/api/documents', { method: 'POST', headers, body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    alert(e.error || 'Échec upload');
    return;
  }
  renderDocuments();
}

async function renderEquipe() {
  const { users } = await API.get('/auth/users');
  $('view-equipe').innerHTML = `
    <h2 class="text-2xl font-bold mb-6">Équipe collaborative</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      ${users.map((u) => `
        <div class="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
          <div class="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold">${esc(u.initials || '?')}</div>
          <div>
            <h4 class="font-semibold">${esc(u.full_name)}</h4>
            <p class="text-sm text-slate-500">${esc(u.role)} · ${esc(u.email)}</p>
          </div>
        </div>`).join('')}
    </div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

boot();
