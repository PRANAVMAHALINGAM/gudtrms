// gudtrms landing page: the looping negotiation in the hero, and the sign-up form.
// Plain JS, no build step. The server is src/site/server.ts.

/* ---------- The line: a two-round negotiation on a loop ---------- */

// Steps: 1 both people tell their agent · 2 agents reply · 3 round 1 crosses · 4 you REJECT (over your limit)
// 5 round 2 crosses · 6 both ACCEPT · 7 deal. Matches the AGENTS.md section 8 demo ($1,615 then $1,390).
const STEP_MS = [700, 1500, 1500, 1500, 2200, 1500, 2000, 3600];
const VERDICTS = { 4: { a: 'reject', b: 'accept' }, 6: { a: 'accept', b: 'accept' }, 7: { a: 'accept', b: 'accept' } };

function setStep(line, step) {
  line.dataset.step = String(step);
  for (const b of line.querySelectorAll('.bubble')) b.classList.toggle('shown', Number(b.dataset.at) <= step);
  const v = VERDICTS[step] ?? {};
  for (const el of line.querySelectorAll('.verdict')) {
    el.classList.remove('accept', 'reject');
    const d = v[el.dataset.who];
    if (d) el.classList.add(d);
  }
}

function playLine() {
  const line = document.getElementById('line');
  if (!line) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setStep(line, 7);

  let step = 0;
  let timer = 0;
  let visible = true;
  const tick = () => {
    setStep(line, step);
    timer = setTimeout(() => {
      step = (step + 1) % STEP_MS.length;
      if (visible) tick();
      else timer = 0;
    }, STEP_MS[step]);
  };
  // Pause while it's off screen; pick up where it left off when it's back.
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !timer) tick();
  }).observe(line);
  tick();
}

/* ---------- Sign up ---------- */

const STORE_KEY = 'gudtrms:signup';

/** +14152024086 -> +1 (415) 202-4086. Other countries stay as they are. */
function prettyPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Opens Messages to `line` with `body` typed in. iMessage can't be sent for someone, so they tap send. */
function smsLink(line, body) {
  return `sms:${line}&body=${encodeURIComponent(body)}`;
}

function showDone(result) {
  const form = document.getElementById('signup-form');
  const done = document.getElementById('done');
  done.querySelector('[data-name]').textContent = result.firstName;
  done.querySelector('[data-line]').textContent = prettyPhone(result.line);
  done.querySelector('[data-start]').href = smsLink(result.line, 'start');
  done.dataset.line = result.line;
  form.hidden = true;
  done.hidden = false;
}

function setupForm() {
  const form = document.getElementById('signup-form');
  const done = document.getElementById('done');
  if (!form || !done) return;
  const submit = form.querySelector('.submit');
  const formError = form.querySelector('.form-error');

  const clearErrors = () => {
    formError.textContent = '';
    for (const input of form.querySelectorAll('input')) {
      input.removeAttribute('aria-invalid');
      const err = document.getElementById(`err-${input.name}`);
      if (err) err.textContent = '';
    }
  };
  const fieldError = (name, message) => {
    const input = form.elements.namedItem(name);
    const err = document.getElementById(`err-${name}`);
    if (!input || !err) return (formError.textContent = message);
    input.setAttribute('aria-invalid', 'true');
    err.textContent = message;
    input.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const data = Object.fromEntries(new FormData(form));
    for (const name of ['name', 'phone', 'email']) {
      if (!String(data[name] ?? '').trim()) {
        return fieldError(name, { name: 'What should we call you?', phone: 'We need your iPhone number to text you.', email: 'We need an email too.' }[name]);
      }
    }

    submit.disabled = true;
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.field) fieldError(body.field, body.error);
        else formError.textContent = body.error ?? 'Something went wrong. Try again?';
        return;
      }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(body)); } catch {}
      showDone(body);
      done.focus();
    } catch {
      formError.textContent = 'Couldn’t reach gudtrms. Check your connection and try again.';
    } finally {
      submit.disabled = false;
    }
  });

  // Case code instead of START, for someone their ex already invited.
  const codeInput = done.querySelector('[data-code]');
  const codeBtn = done.querySelector('[data-code-btn]');
  codeInput.addEventListener('input', () => {
    const code = codeInput.value.toUpperCase().replace(/[^2-9A-HJKMNP-Z]/g, '').slice(0, 4);
    codeInput.value = code;
    const ok = code.length === 4 && /[2-9]/.test(code);
    codeBtn.setAttribute('aria-disabled', String(!ok));
    codeBtn.href = ok ? smsLink(done.dataset.line, code) : '#';
  });

  done.querySelector('[data-reset]').addEventListener('click', () => {
    try { localStorage.removeItem(STORE_KEY); } catch {}
    form.reset();
    done.hidden = true;
    form.hidden = false;
    form.querySelector('input').focus();
  });

  // Back on the page later: skip straight to the Start texting button.
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (saved?.line && saved?.firstName) showDone(saved);
  } catch {}
}

playLine();
setupForm();
