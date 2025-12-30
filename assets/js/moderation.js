(function(){
  'use strict';

  var section = document.getElementById('moderation');
  if (!section) return;

  var form = document.getElementById('moderator-login-form');
  var statusEl = document.getElementById('moderation-status');
  var config = window.UNION_MODERATOR_CONFIG || {};
  var supabaseUrl = section.dataset.supabaseUrl || config.supabaseUrl || '';
  var supabaseAnonKey = section.dataset.supabaseKey || config.supabaseAnonKey || '';
  var createClient = window.supabase && typeof window.supabase.createClient === 'function' ? window.supabase.createClient : null;
  var submitBtn = form && form.querySelector('button[type="submit"]');
  var emailInput = form && form.querySelector('#moderator-email');
  var passwordInput = form && form.querySelector('#moderator-password');

  if (!form || !statusEl || !emailInput || !passwordInput){
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    updateStatus('Configura supabaseUrl e supabaseAnonKey nelle variabili sopra per abilitare il login.', true);
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');
    return;
  }

  if (!createClient) {
    updateStatus('La libreria Supabase non è stata caricata. Inserisci la CDN prima di questo script.', true);
    return;
  }

  var supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  var isWorking = false;
  var failedAttempts = Number(localStorage.getItem('moderatorFailedAttempts') || 0);
  var lockoutUntil = Number(localStorage.getItem('moderatorLockoutUntil') || 0);
  var lockoutTimer = null;
  var isLockedOut = false;

  form.addEventListener('submit', function(event){
    event.preventDefault();
    loginModerator();
  });

  checkLockout();

  function updateStatus(message, isError){
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', !!isError);
  }

  function clearLockoutTimer(){
    if (lockoutTimer){
      clearTimeout(lockoutTimer);
      lockoutTimer = null;
    }
  }

  function refreshFormState(){
    var disabled = isWorking || isLockedOut;
    [emailInput, passwordInput, submitBtn].forEach(function(el){
      if (el) el.disabled = disabled;
    });
  }

  function setWorking(value){
    isWorking = value;
    refreshFormState();
  }

  function checkLockout(){
    clearLockoutTimer();
    var now = Date.now();
    if (lockoutUntil && now < lockoutUntil){
      isLockedOut = true;
      refreshFormState();
      var remaining = Math.ceil((lockoutUntil - now) / 1000);
      updateStatus('Troppi tentativi. Riprova tra ' + remaining + 's.', true);
      lockoutTimer = setTimeout(checkLockout, 1000);
      return;
    }
    var wasLocked = isLockedOut;
    isLockedOut = false;
    refreshFormState();
    if (lockoutUntil){
      lockoutUntil = 0;
      localStorage.removeItem('moderatorLockoutUntil');
    }
    if (wasLocked){
      failedAttempts = 0;
      localStorage.removeItem('moderatorFailedAttempts');
      updateStatus('Puoi riprovare ad accedere.', false);
    }
  }

  function recordFailedAttempt(){
    failedAttempts += 1;
    localStorage.setItem('moderatorFailedAttempts', '' + failedAttempts);
    if (failedAttempts >= 5){
      lockoutUntil = Date.now() + (60 * 1000);
      localStorage.setItem('moderatorLockoutUntil', '' + lockoutUntil);
      checkLockout();
    }
  }

  function resetFailedAttempts(){
    failedAttempts = 0;
    localStorage.removeItem('moderatorFailedAttempts');
    lockoutUntil = 0;
    localStorage.removeItem('moderatorLockoutUntil');
    clearLockoutTimer();
    isLockedOut = false;
    refreshFormState();
  }

  async function loginModerator(){
    if (isWorking) return;
    if (isLockedOut){
      checkLockout();
      return;
    }
    var email = (emailInput.value || '').trim();
    var password = passwordInput.value || '';

    if (!email || !password){
      updateStatus('Completa email e password per accedere.', true);
      return;
    }

    setWorking(true);
    updateStatus('Verifica delle credenziali in corso...');
    try {
      var response = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (response.error) throw response.error;
      var user = response.data?.user;
      if (!user) throw new Error('Nessun utente trovato.');

      var profile = await supabaseClient.from('erasmus_users').select('is_admin').eq('id', user.id).maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data || !profile.data.is_admin){
        throw new Error('Accesso riservato ai moderatori autenticati.');
      }

      resetFailedAttempts();
      updateStatus('Accesso autorizzato. Reindirizzamento verso la dashboard...');
      setTimeout(function(){ location.href = 'admin-dashboard.html'; }, 800);
    } catch (error) {
      var message = error?.message || 'Impossibile completare l\'accesso.';
      updateStatus(message, true);
      recordFailedAttempt();
    } finally {
      setWorking(false);
    }
  }
})();
