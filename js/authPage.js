// js/authPage.js
// Login / registration page logic (runs on index.html).
import { supabase, CONFIG_OK } from './supabaseClient.js';
import { toast, setBusy } from './ui.js';
import { signIn, signUp } from './auth.js';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const msgBox = document.getElementById('auth-message');

// Department -> Program / Grade Level hierarchy (mirrors the profile page
// dropdowns in app.html / js/app.js). Kept as a separate copy here because
// the login page never loads app.js.
const hierarchyData = {
  'College Department': ['BSIT', 'BSHM', 'BSENTREP', 'BSED-ENGLISH', 'BSED-MATH', 'BSED-SCIENCE', 'BPED', 'BEED'],
  'Senior High': ['STEM', 'HUMSS', 'TVL', 'ABM'],
  'Junior High': ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'],
  'Kindergarten': ['Kindergarten Level']
};

/** Rebuild the Program / Grade Level options for the selected department. */
function updateRegSubOptions() {
  const deptSelect = document.getElementById('reg-department');
  const subSelect = document.getElementById('reg-sub-option');
  if (!deptSelect || !subSelect) return;
  const selectedDept = deptSelect.value;

  subSelect.innerHTML = '<option value="">Select Option...</option>';

  if (selectedDept && hierarchyData[selectedDept]) {
    hierarchyData[selectedDept].forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      subSelect.appendChild(option);
    });
  }
}

function showMessage(text, kind = 'error') {
  const styles = {
    error: 'bg-rose-50 border border-rose-200 text-rose-700',
    success: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
    info: 'bg-indigo-50 border border-indigo-200 text-indigo-700'
  };
  msgBox.className = `mx-6 mb-6 border rounded-lg p-3 text-sm ${styles[kind]}`;
  msgBox.innerText = text;
  msgBox.classList.remove('hidden');
}

function init() {
  if (!CONFIG_OK) {
    document.getElementById('config-warning').classList.remove('hidden');
    loginForm.querySelector('button[type="submit"]').disabled = true;
    registerForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  // already signed in? go straight to the app
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) location.replace('app.html');
  });

  wireTabs();
  loginForm.addEventListener('submit', onLogin);
  registerForm.addEventListener('submit', onRegister);
  // Department dropdown drives the Program / Grade Level options.
  registerForm.addEventListener('change', (e) => {
    if (e.target.id === 'reg-department') updateRegSubOptions();
  });
}

function wireTabs() {
  const loginTab = document.getElementById('tab-login-btn');
  const regTab = document.getElementById('tab-register-btn');
  const show = (which) => {
    const isLogin = which === 'login';
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
    msgBox.classList.add('hidden');
    loginTab.className = `py-3 border-b-2 ${isLogin ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-indigo-600'}`;
    regTab.className = `py-3 border-b-2 ${!isLogin ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-indigo-600'}`;
  };
  loginTab.addEventListener('click', () => show('login'));
  regTab.addEventListener('click', () => show('register'));
}

async function onLogin(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  const email = form.email.value.trim();
  const password = form.password.value;

  // Guard locally so we never send a blank request to Supabase.
  if (!email || !password) {
    showMessage('Please enter both your email and password.', 'info');
    return;
  }

  setBusy(btn, true, 'Signing in...');
  try {
    // signIn() calls supabase.auth.signInWithPassword() and throws on error.
    const { session } = await signIn(email, password);

    // A successful call should always yield a session. If it does not, the
    // dashboard would immediately bounce us back, so fail loudly instead.
    if (!session) throw new Error('Sign-in did not return a session. Please try again.');

    // Confirm the session really persisted before navigating.
    const { data: { session: live } } = await supabase.auth.getSession();
    if (!live) throw new Error('Could not restore your session. Please try again.');

    toast('Signed in successfully.', 'success');
    location.replace('app.html');
  } catch (err) {
    showMessage(err.message || 'Login failed. Please check your details.');
    setBusy(btn, false); // re-enable so the user can retry
  }
}

async function onRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const fullName = e.target.full_name.value.trim();
  const email = e.target.email.value.trim();
  const password = e.target.password.value;
  const confirm = e.target.confirm.value;
  const studentNumber = e.target.student_number.value.trim();

  if (!fullName) { showMessage('Please enter your full name.'); return; }
  if (!studentNumber) { showMessage('Please enter your school ID number.'); return; }
  if (password.length < 6) { showMessage('Password must be at least 6 characters.'); return; }
  if (password !== confirm) { showMessage('Passwords do not match.'); return; }
  const department = document.getElementById('reg-department').value;
  const gradeClass = document.getElementById('reg-sub-option').value;
  if (!department) { showMessage('Please select your department.'); return; }
  if (!gradeClass) { showMessage('Please select your program / grade level.'); return; }

  setBusy(btn, true, 'Creating account...');
  try {
    const { session } = await signUp(email, password, fullName, department, gradeClass, studentNumber);
    if (session) {
      toast('Account created. Welcome!', 'success');
      location.replace('app.html');
    } else {
      showMessage('Account created. Please check your email to confirm, then log in.', 'success');
      setBusy(btn, false);
    }
  } catch (err) {
    showMessage(err.message || 'Registration failed.');
    setBusy(btn, false);
  }
}

// This file is loaded as a deferred module script, so the DOM is usually already
// parsed and DOMContentLoaded has often ALREADY fired by the time we get here.
// Registering a plain 'DOMContentLoaded' listener would therefore never run the
// initializer (and the form would silently do nothing). Boot immediately when the
// document is ready, otherwise wait for the event.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
