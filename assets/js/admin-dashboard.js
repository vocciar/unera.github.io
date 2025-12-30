(function(){
  'use strict';

  var section = document.getElementById('admin-dashboard');
  if (!section) return;

  var statusEl = document.getElementById('admin-dashboard-status');
  var refreshBtn = document.getElementById('admin-dashboard-refresh');
  var logoutBtn = document.getElementById('admin-dashboard-logout');
  var statsRoots = {
    bans: document.querySelector('[data-stat="bans"]'),
    reports: document.querySelector('[data-stat="reports"]'),
    universities: document.querySelector('[data-stat="universities"]')
  };
  var reportsRefreshBtn = document.getElementById('reports-refresh');
  var reportsStatusEl = document.getElementById('reports-action-status');
  var reportsTable = document.getElementById('reports-table');
  var reportsTableBody = document.getElementById('reports-table-body');
  var reportsFilterForm = document.getElementById('reports-filter-form');
  var bansRefreshBtn = document.getElementById('bans-refresh');
  var bansStatusEl = document.getElementById('bans-action-status');
  var bansTable = document.getElementById('bans-table');
  var bansTableBody = document.getElementById('bans-table-body');
  var bansFilterForm = document.getElementById('bans-filter-form');
  var universitiesRefreshBtn = document.getElementById('universities-refresh');
  var universitiesStatusEl = document.getElementById('universities-action-status');
  var universitiesTable = document.getElementById('universities-table');
  var universitiesTableBody = document.getElementById('universities-table-body');
  var universitiesFilterForm = document.getElementById('universities-filter-form');
  var config = window.UNION_MODERATOR_CONFIG || {};
  var supabaseUrl = section.dataset.supabaseUrl || config.supabaseUrl || '';
  var supabaseAnonKey = section.dataset.supabaseKey || config.supabaseAnonKey || '';
  var createClient = window.supabase && typeof window.supabase.createClient === 'function' ? window.supabase.createClient : null;

  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus('Configura supabaseUrl e supabaseAnonKey per attivare la dashboard.', true);
    return;
  }
  if (!createClient) {
    setStatus('La libreria Supabase non è stata caricata. Inserisci la CDN prima di questo script.', true);
    return;
  }

  var supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  var isWorking = false;
  var reportsWorking = false;
  var bansWorking = false;
  var universitiesWorking = false;
  var currentAdminId = null;
  var revalidationTimer = null;
  var reportFilters = { status: 'pending', category: '', search: '' };
  var banFilters = { action_type: '', expires_before: '' };
  var universityFilters = { status: 'pending', domain: '' };

  refreshBtn.addEventListener('click', function(){
    fetchSummary();
  });
  logoutBtn.addEventListener('click', function(){
    supabaseClient.auth.signOut().finally(function(){
      stopSessionRevalidation();
      location.href = 'admin.html';
    });
  });
  if (reportsRefreshBtn) {
    reportsRefreshBtn.addEventListener('click', function(){
      fetchReports();
    });
  }
  if (reportsTable) {
    reportsTable.addEventListener('click', function(event){
      var button = event.target.closest('button[data-report-id]');
      if (!button) return;
      var reportId = button.getAttribute('data-report-id');
      var status = button.getAttribute('data-status');
      if (reportId && status) {
        updateReportStatus(reportId, status);
      }
    });
  }
  if (reportsFilterForm){
    reportsFilterForm.addEventListener('change', function(){
      var formData = new FormData(reportsFilterForm);
      reportFilters.status = formData.get('status') || 'pending';
      reportFilters.category = formData.get('category') || '';
      reportFilters.search = (formData.get('search') || '').trim();
      fetchReports();
    });
    reportsFilterForm.addEventListener('submit', function(ev){ ev.preventDefault(); });
  }
  if (bansRefreshBtn) {
    bansRefreshBtn.addEventListener('click', function(){
      fetchBans();
    });
  }
  if (bansTable) {
    bansTable.addEventListener('click', function(event){
      var button = event.target.closest('button[data-ban-id]');
      if (!button) return;
      var banId = button.getAttribute('data-ban-id');
      if (banId){
        revokeBan(banId);
      }
    });
  }
  if (bansFilterForm){
    bansFilterForm.addEventListener('change', function(){
      var values = new FormData(bansFilterForm);
      banFilters.action_type = values.get('action_type') || '';
      banFilters.expires_before = values.get('expires_before') || '';
      fetchBans();
    });
    bansFilterForm.addEventListener('submit', function(ev){ ev.preventDefault(); });
  }
  if (universitiesRefreshBtn) {
    universitiesRefreshBtn.addEventListener('click', function(){
      fetchUniversities();
    });
  }
  if (universitiesTable) {
    universitiesTable.addEventListener('click', function(event){
      var button = event.target.closest('button[data-university-id]');
      if (!button) return;
      var uniId = button.getAttribute('data-university-id');
      var status = button.getAttribute('data-status');
      var note = button.getAttribute('data-note') || '';
      if (uniId && status){
        updateUniversityStatus(uniId, status, note);
      }
    });
  }
  if (universitiesFilterForm){
    universitiesFilterForm.addEventListener('change', function(){
      var values = new FormData(universitiesFilterForm);
      universityFilters.status = values.get('status') || 'pending';
      universityFilters.domain = (values.get('domain') || '').trim();
      fetchUniversities();
    });
    universitiesFilterForm.addEventListener('submit', function(ev){ ev.preventDefault(); });
  }

  function setStatus(message, isError){
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function setWorking(value){
    isWorking = value;
    if (refreshBtn) refreshBtn.disabled = value;
  }

  function redirectToLogin(){
    setStatus('Sessione non valida. Ritorno alla pagina di login...', true);
    stopSessionRevalidation();
    supabaseClient.auth.signOut().finally(function(){
      setTimeout(function(){ location.href = 'admin.html'; }, 600);
    });
  }

  async function init(){
    setStatus('Verifico sessione...');
    var { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData?.session){
      return redirectToLogin();
    }
    var { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user){
      return redirectToLogin();
    }

    var profile = await supabaseClient
      .from('erasmus_users')
      .select('is_admin')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profile.error || !profile.data || !profile.data.is_admin){
      return redirectToLogin();
    }

    currentAdminId = userData.user.id;
    setStatus('Accesso confermato. Aggiorno i contenuti...');
    fetchSummary();
    fetchReports();
    fetchBans();
    fetchUniversities();
    startSessionRevalidation();
  }

  async function fetchSummary(){
    setWorking(true);
    setStatus('Sto recuperando i conteggi...');
    try {
      var requests = await Promise.all([
        supabaseClient
          .from('moderation_actions')
          .select('id', { head: true, count: 'exact' })
          .eq('is_active', true),
        supabaseClient
          .from('user_reports')
          .select('id', { head: true, count: 'exact' })
          .in('status', ['pending', 'under_review']),
        supabaseClient
          .from('university_requests')
          .select('id', { head: true, count: 'exact' })
          .eq('status', 'pending')
      ]);

      handleCount('bans', requests[0]);
      handleCount('reports', requests[1]);
      handleCount('universities', requests[2]);
      setStatus('Conteggi aggiornati.');
    } catch (error) {
      setStatus(error?.message || 'Errore durante il recupero dei conteggi.', true);
    } finally {
      setWorking(false);
    }
  }

  function handleCount(key, result){
    if (!result) return;
    if (result.error) throw result.error;
    var parsed = Number(result.count);
    var countValue = Number.isFinite(parsed) ? parsed : 0;
    var target = statsRoots[key];
    if (target) target.textContent = String(countValue);
  }

  function setReportsStatus(message, isError){
    if (!reportsStatusEl) return;
    reportsStatusEl.textContent = message;
    reportsStatusEl.classList.toggle('is-error', !!isError);
  }

  function setReportsWorking(value){
    reportsWorking = value;
    if (reportsRefreshBtn) reportsRefreshBtn.disabled = value;
    if (reportsTableBody){
      reportsTableBody.querySelectorAll('button[data-report-id]').forEach(function(btn){
        btn.disabled = value;
      });
    }
  }

  async function fetchReports(){
    if (!reportsTableBody) return;
    setReportsWorking(true);
    setReportsStatus('Carico segnalazioni...');
    try {
      var query = supabaseClient
        .from('user_reports')
        .select('id, category, status, created_at, description, admin_notes, reporter:reporter_id(email,name,surname), reported:reported_id(email,name,surname)')
        .order('created_at', { ascending: false })
        .limit(30);
      if (reportFilters.status && reportFilters.status !== 'all'){
        query = query.eq('status', reportFilters.status);
      }
      if (reportFilters.category){
        query = query.eq('category', reportFilters.category);
      }
      var { data, error } = await query;
      if (error) throw error;
      var reports = data || [];
      if (reportFilters.search){
        var needle = reportFilters.search.toLowerCase();
        reports = reports.filter(function(row){
          var reporterEmail = (row.reporter?.email || '').toLowerCase();
          var reportedEmail = (row.reported?.email || '').toLowerCase();
          return (row.id || '').toLowerCase().includes(needle) || reporterEmail.includes(needle) || reportedEmail.includes(needle);
        });
      }
      renderReportsTable(reports);
      setReportsStatus('Segnalazioni aggiornate.');
    } catch (error) {
      setReportsStatus(error?.message || 'Errore durante il caricamento delle segnalazioni.', true);
    } finally {
      setReportsWorking(false);
    }
  }

  function renderReportsTable(reports){
    if (!reportsTableBody) return;
    if (!reports.length){
      reportsTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Nessuna segnalazione disponibile.</td></tr>';
      return;
    }
    reportsTableBody.innerHTML = reports.map(function(report){
      var reporter = formatUserLabel(report.reporter);
      var reported = formatUserLabel(report.reported);
      var created = report.created_at ? new Date(report.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var buttons = [
        report.status !== 'under_review' ? '<button type="button" class="button button-ghost" data-report-id="' + report.id + '" data-status="under_review">In revisione</button>' : '',
        report.status !== 'resolved' ? '<button type="button" class="button button-ghost" data-report-id="' + report.id + '" data-status="resolved">Risolvilo</button>' : '',
        '<button type="button" class="button button-ghost" data-report-id="' + report.id + '" data-status="dismissed">Ignora</button>'
      ];
      return '<tr>' +
        '<td>' + report.id.slice(0,8) + '</td>' +
        '<td>' + reporter + '</td>' +
        '<td>' + reported + '</td>' +
        '<td>' + (report.category || '—') + '</td>' +
        '<td>' + (report.status || '—') + '</td>' +
        '<td>' + created + '</td>' +
        '<td class="reports-actions">' + buttons.join('') + '</td>' +
      '</tr>';
    }).join('');
  }

  function formatUserLabel(profile){
    if (!profile) return '—';
    if (profile.email) return profile.email;
    if (profile.name || profile.surname) return ((profile.name || '') + ' ' + (profile.surname || '')).trim();
    return 'Utente';
  }

  async function updateReportStatus(reportId, status){
    if (reportsWorking) return;
    setReportsWorking(true);
    setReportsStatus('Aggiorno la segnalazione...');
    try {
      var payload = {
        status: status,
        reviewed_by: currentAdminId,
        reviewed_at: new Date().toISOString()
      };
      var { error } = await supabaseClient
        .from('user_reports')
        .update(payload)
        .eq('id', reportId);
      if (error) throw error;
      setReportsStatus('Segnalazione aggiornata.');
      logAuditEvent('report_status_change', { reportId, status, adminId: currentAdminId });
      fetchReports();
      fetchSummary();
    } catch (error) {
      setReportsStatus(error?.message || 'Errore durante l\'update del report.', true);
    } finally {
      setReportsWorking(false);
    }
  }

  function formatDate(value){
    if (!value) return '—';
    return new Date(value).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function setBansStatus(message, isError){
    if (!bansStatusEl) return;
    bansStatusEl.textContent = message;
    bansStatusEl.classList.toggle('is-error', !!isError);
  }

  function setBansWorking(value){
    bansWorking = value;
    if (bansRefreshBtn) bansRefreshBtn.disabled = value;
    if (bansTableBody){
      bansTableBody.querySelectorAll('button[data-ban-id]').forEach(function(btn){
        btn.disabled = value;
      });
    }
  }

  async function fetchBans(){
    if (!bansTableBody) return;
    setBansWorking(true);
    setBansStatus('Carico ban attivi...');
    try {
      var query = supabaseClient
        .from('moderation_actions')
        .select('id, reason, action_type, expires_at, created_at, user:erasmus_users!moderation_actions_user_id_fkey(id,email,name,surname)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30);
      if (banFilters.action_type){
        query = query.eq('action_type', banFilters.action_type);
      }
      var { data, error } = await query;
      if (error) throw error;
      var bans = data || [];
      if (banFilters.expires_before){
        var threshold = new Date(banFilters.expires_before).toISOString();
        bans = bans.filter(function(record){
          return record.expires_at && record.expires_at <= threshold;
        });
      }
      renderBansTable(bans);
      setBansStatus('Ban aggiornati.');
    } catch (error) {
      setBansStatus(error?.message || 'Errore durante il caricamento dei ban.', true);
    } finally {
      setBansWorking(false);
    }
  }

  function renderBansTable(records){
    if (!bansTableBody) return;
    if (!records.length){
      bansTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Nessun ban attivo al momento.</td></tr>';
      return;
    }
    bansTableBody.innerHTML = records.map(function(record){
      var user = formatUserLabel(record.user);
      var created = formatDate(record.created_at);
      var expires = record.expires_at ? formatDate(record.expires_at) : '—';
      var buttons = '<button type="button" class="button button-ghost" data-ban-id="' + record.id + '">Revoca</button>';
      return '<tr>' +
        '<td>' + record.id.slice(0,8) + '</td>' +
        '<td>' + user + '</td>' +
        '<td>' + (record.action_type || '—') + '</td>' +
        '<td>' + (record.reason || '—') + '</td>' +
        '<td>' + expires + '</td>' +
        '<td>' + created + '</td>' +
        '<td>' + buttons + '</td>' +
      '</tr>';
    }).join('');
  }

  async function revokeBan(banId){
    if (bansWorking) return;
    setBansWorking(true);
    setBansStatus('Revoco il ban...');
    try {
      var payload = {
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: currentAdminId
      };
      var { error } = await supabaseClient
        .from('moderation_actions')
        .update(payload)
        .eq('id', banId);
      if (error) throw error;
      setBansStatus('Ban revocato.');
      logAuditEvent('ban_revoked', { banId, adminId: currentAdminId });
      fetchBans();
      fetchSummary();
    } catch (error) {
      setBansStatus(error?.message || 'Errore durante la revoca del ban.', true);
    } finally {
      setBansWorking(false);
    }
  }

  function setUniversitiesStatus(message, isError){
    if (!universitiesStatusEl) return;
    universitiesStatusEl.textContent = message;
    universitiesStatusEl.classList.toggle('is-error', !!isError);
  }

  function setUniversitiesWorking(value){
    universitiesWorking = value;
    if (universitiesRefreshBtn) universitiesRefreshBtn.disabled = value;
    if (universitiesTableBody){
      universitiesTableBody.querySelectorAll('button[data-university-id]').forEach(function(btn){
        btn.disabled = value;
      });
    }
  }

  async function fetchUniversities(){
    if (!universitiesTableBody) return;
    setUniversitiesWorking(true);
    setUniversitiesStatus('Carico richieste universitarie...');
    try {
      var query = supabaseClient
        .from('university_requests')
        .select('id, proposed_name, proposed_domain, user_email, status, review_notes, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (universityFilters.status && universityFilters.status !== 'all'){
        query = query.eq('status', universityFilters.status);
      }
      if (universityFilters.domain){
        query = query.ilike('proposed_domain', '%' + universityFilters.domain + '%');
      }
      var { data, error } = await query;
      if (error) throw error;
      renderUniversitiesTable(data || []);
      setUniversitiesStatus('Richieste aggiornate.');
    } catch (error) {
      setUniversitiesStatus(error?.message || 'Errore durante il caricamento delle richieste.', true);
    } finally {
      setUniversitiesWorking(false);
    }
  }

  function renderUniversitiesTable(records){
    if (!universitiesTableBody) return;
    if (!records.length){
      universitiesTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Nessuna richiesta in sospeso.</td></tr>';
      return;
    }
    universitiesTableBody.innerHTML = records.map(function(record){
      var created = formatDate(record.created_at);
      var note = record.review_notes ? record.review_notes.substring(0, 80) : '—';
      var actions = [
        '<button type="button" class="button button-ghost" data-university-id="' + record.id + '" data-status="approved">Approva</button>',
        '<button type="button" class="button button-ghost" data-university-id="' + record.id + '" data-status="rejected">Rifiuta</button>',
        '<button type="button" class="button button-ghost" data-university-id="' + record.id + '" data-status="pending" data-note="Richiesta di informazioni aggiuntive">Richiedi info</button>'
      ];
      return '<tr>' +
        '<td>' + record.id + '</td>' +
        '<td>' + (record.proposed_name || '—') + '</td>' +
        '<td>' + (record.proposed_domain || '—') + '</td>' +
        '<td>' + (record.user_email || '—') + '</td>' +
        '<td>' + (record.status || '—') + '</td>' +
        '<td>' + note + '</td>' +
        '<td class="reports-actions">' + actions.join('') + '</td>' +
      '</tr>';
    }).join('');
  }

  async function updateUniversityStatus(uniId, status, note){
    if (universitiesWorking) return;
    setUniversitiesWorking(true);
    setUniversitiesStatus('Aggiorno lo stato della richiesta...');
    try {
      var payload = {
        status: status,
        review_notes: note ? note + ' (' + new Date().toLocaleString('it-IT') + ')' : null,
        updated_at: new Date().toISOString()
      };
      var { error } = await supabaseClient
        .from('university_requests')
        .update(payload)
        .eq('id', Number(uniId));
      if (error) throw error;
      setUniversitiesStatus('Richiesta aggiornata.');
      logAuditEvent('university_request_status_change', { requestId: uniId, status, note, adminId: currentAdminId });
      fetchUniversities();
      fetchSummary();
    } catch (error) {
      setUniversitiesStatus(error?.message || 'Errore durante l\'aggiornamento della richiesta.', true);
    } finally {
      setUniversitiesWorking(false);
    }
  }

  async function logAuditEvent(eventType, payload){
    try {
      if (!supabaseClient || typeof supabaseClient.rpc !== 'function') return;
      await supabaseClient.rpc('moderation_log_event', {
        event_type: eventType,
        payload: JSON.stringify(payload || {})
      });
    } catch (_) {
      // Non blocchiamo la UI se il log fallisce
    }
  }

  function startSessionRevalidation(){
    stopSessionRevalidation();
    revalidationTimer = setInterval(checkSessionValidity, 5 * 60 * 1000);
  }

  function stopSessionRevalidation(){
    if (revalidationTimer){
      clearInterval(revalidationTimer);
      revalidationTimer = null;
    }
  }

  async function checkSessionValidity(){
    try {
      var { data, error } = await supabaseClient.auth.getSession();
      if (error || !data?.session){
        redirectToLogin();
      }
    } catch (_) {
      redirectToLogin();
    }
  }

  window.addEventListener('beforeunload', stopSessionRevalidation);

  init();
})();
