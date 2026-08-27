'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  LOCALE_DEFINITIONS,
  UI_LOCALES,
  getTextDirection,
  type UiLocale,
} from '@ledgerly/localization';
import { DASHBOARD_CATALOGS, NAVIGATION_KEYS, RUNTIME_CATALOGS } from '@ledgerly/localization/catalogs';
import {
  RuntimeApiError,
  RuntimeApiUnavailableError,
  createRuntimeApi,
  type SessionUser,
  type TenantCompany,
  type TenantListItem,
} from './runtime-api';

const localeOptions = UI_LOCALES.map((locale) => [locale, LOCALE_DEFINITIONS[locale].nativeName] as const);
type Locale = UiLocale;
const copy = DASHBOARD_CATALOGS;
const localeStorageKey = 'ledgerly.locale';
const localeChangeEvent = 'ledgerly:locale-change';

const metrics = ['cash', 'receivables', 'payables', 'netProfit'] as const;

type RuntimePhase =
  | 'disconnected'
  | 'checking'
  | 'anonymous'
  | 'signing-in'
  | 'loading-organizations'
  | 'loading-companies'
  | 'ready'
  | 'no-organizations'
  | 'no-companies'
  | 'offline'
  | 'forbidden'
  | 'error';

type RuntimeView = Readonly<{
  phase: RuntimePhase;
  user: SessionUser | null;
  tenants: readonly TenantListItem[];
  companies: readonly TenantCompany[];
  tenantId: string;
  companyId: string;
  notice: 'invalid-credentials' | 'session-expired' | null;
  reference: string | null;
}>;

function emptyRuntime(phase: RuntimePhase): RuntimeView {
  return Object.freeze({
    phase,
    user: null,
    tenants: Object.freeze([]),
    companies: Object.freeze([]),
    tenantId: '',
    companyId: '',
    notice: null,
    reference: null,
  });
}

function localeSnapshot(): Locale {
  const saved = localStorage.getItem(localeStorageKey);
  return saved && saved in copy ? saved as Locale : 'en-US';
}

function subscribeToLocale(onChange: () => void): () => void {
  const listener = () => onChange();
  window.addEventListener('storage', listener);
  window.addEventListener(localeChangeEvent, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(localeChangeEvent, listener);
  };
}

function setLocalePreference(locale: Locale): void {
  localStorage.setItem(localeStorageKey, locale);
  window.dispatchEvent(new Event(localeChangeEvent));
}

export function AccountingShell({ runtimeApiConfigured = false }: Readonly<{ runtimeApiConfigured?: boolean }>) {
  const locale = useSyncExternalStore<Locale>(subscribeToLocale, localeSnapshot, (): Locale => 'en-US');
  const t = copy[locale];
  const runtimeText = RUNTIME_CATALOGS[locale];
  const rtl = getTextDirection(locale) === 'rtl';
  const runtimeApi = useMemo(() => createRuntimeApi(), []);
  const requestSequence = useRef(0);
  const [runtime, setRuntime] = useState<RuntimeView>(() => emptyRuntime(
    runtimeApiConfigured ? 'checking' : 'disconnected',
  ));
  const money = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency', currency: locale === 'fa-IR' ? 'IRR' : 'USD', maximumFractionDigits: 0,
  }), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [locale, rtl]);

  const applyRuntimeError = useCallback((error: unknown, user: SessionUser | null, loginAttempt = false) => {
    if (error instanceof RuntimeApiError && error.problem.status === 401) {
      setRuntime({
        ...emptyRuntime('anonymous'),
        notice: loginAttempt
          ? 'invalid-credentials'
          : error.problem.code === 'AUTHENTICATION_REQUIRED' ? null : 'session-expired',
        reference: error.problem.correlationId ?? null,
      });
      return;
    }
    const base: RuntimeView = {
      ...emptyRuntime(error instanceof RuntimeApiUnavailableError ? 'offline' : 'error'),
      user,
      reference: error instanceof RuntimeApiError ? error.problem.correlationId ?? null : null,
    };
    if (error instanceof RuntimeApiError && error.problem.status === 403) {
      setRuntime({ ...base, phase: 'forbidden' });
      return;
    }
    if (error instanceof RuntimeApiError && error.problem.status === 503) {
      setRuntime({ ...base, phase: 'offline' });
      return;
    }
    setRuntime(base);
  }, []);

  const loadScope = useCallback(async (user: SessionUser) => {
    const sequence = ++requestSequence.current;
    setRuntime({ ...emptyRuntime('loading-organizations'), user });
    try {
      const tenantResult = await runtimeApi.listTenants();
      if (requestSequence.current !== sequence) return;
      if (tenantResult.items.length === 0) {
        setRuntime({ ...emptyRuntime('no-organizations'), user });
        return;
      }
      const tenantId = tenantResult.items[0]?.id ?? '';
      setRuntime({
        ...emptyRuntime('loading-companies'),
        user,
        tenants: tenantResult.items,
        tenantId,
      });
      const companyResult = await runtimeApi.listCompanies(tenantId);
      if (requestSequence.current !== sequence) return;
      setRuntime({
        phase: companyResult.items.length > 0 ? 'ready' : 'no-companies',
        user,
        tenants: tenantResult.items,
        companies: companyResult.items,
        tenantId,
        companyId: companyResult.items[0]?.id ?? '',
        notice: null,
        reference: null,
      });
    } catch (error) {
      if (requestSequence.current === sequence) applyRuntimeError(error, user);
    }
  }, [applyRuntimeError, runtimeApi]);

  const checkSession = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setRuntime(emptyRuntime('checking'));
    try {
      const session = await runtimeApi.getSession();
      if (requestSequence.current === sequence) await loadScope(session.user);
    } catch (error) {
      if (requestSequence.current === sequence) applyRuntimeError(error, null);
    }
  }, [applyRuntimeError, loadScope, runtimeApi]);

  useEffect(() => {
    if (!runtimeApiConfigured) return;
    const sequence = ++requestSequence.current;
    void runtimeApi.getSession().then(async (session) => {
      if (requestSequence.current === sequence) await loadScope(session.user);
    }).catch((error: unknown) => {
      if (requestSequence.current === sequence) applyRuntimeError(error, null);
    });
    return () => { requestSequence.current += 1; };
  }, [applyRuntimeError, loadScope, runtimeApi, runtimeApiConfigured]);

  const signIn = useCallback(async (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const sequence = ++requestSequence.current;
    setRuntime(emptyRuntime('signing-in'));
    try {
      const session = await runtimeApi.login({ email, password });
      form.reset();
      if (requestSequence.current === sequence) await loadScope(session.user);
    } catch (error) {
      form.reset();
      if (requestSequence.current === sequence) applyRuntimeError(error, null, true);
    }
  }, [applyRuntimeError, loadScope, runtimeApi]);

  const signOut = useCallback(async () => {
    requestSequence.current += 1;
    setRuntime(emptyRuntime('checking'));
    try {
      await runtimeApi.logout();
    } catch {
      // The BFF clears its host-only cookie even when upstream logout fails.
    } finally {
      setRuntime(emptyRuntime('anonymous'));
    }
  }, [runtimeApi]);

  const selectTenant = useCallback(async (tenantId: string) => {
    if (!runtime.user) return;
    const sequence = ++requestSequence.current;
    setRuntime((current) => ({
      ...current,
      phase: 'loading-companies',
      tenantId,
      companyId: '',
      companies: Object.freeze([]),
      reference: null,
    }));
    try {
      const result = await runtimeApi.listCompanies(tenantId);
      if (requestSequence.current !== sequence) return;
      setRuntime((current) => ({
        ...current,
        phase: result.items.length > 0 ? 'ready' : 'no-companies',
        companies: result.items,
        companyId: result.items[0]?.id ?? '',
      }));
    } catch (error) {
      if (requestSequence.current === sequence) applyRuntimeError(error, runtime.user);
    }
  }, [applyRuntimeError, runtime.user, runtimeApi]);

  const selectedCompany = runtime.companies.find((company) => company.id === runtime.companyId) ?? null;
  const avatarText = runtime.user ? initials(runtime.user.displayName) : 'AM';

  return (
    <div className="app-shell" dir={rtl ? 'rtl' : 'ltr'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">L</span><strong>{t.product}</strong></div>
        <nav aria-label={t.product}>
          {NAVIGATION_KEYS.map((key, index) => <a className={index === 0 ? 'active' : ''} href="#" key={key}><span className="nav-dot" />{t.navigation[key]}</a>)}
        </nav>
        <div className="sidebar-foot"><span className="balance-dot" />{t.booksBalanced}</div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="company-switcher"><strong>{selectedCompany?.name ?? t.company}</strong><span>{selectedCompany ? `${selectedCompany.baseCurrency} · ${selectedCompany.timeZone}` : t.period}</span></div>
          <button className="search" type="button"><kbd>⌘ K</kbd><span>{t.search}</span></button>
          <label className="locale-picker"><span className="sr-only">{t.language}</span><select value={locale} aria-label={t.language} onChange={(event) => setLocalePreference(event.target.value as Locale)}>{localeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button className="avatar" aria-label={runtime.user ? `${runtimeText.signedInAs} ${runtime.user.displayName}` : t.account} title={runtime.user?.displayName ?? t.account} type="button">{avatarText}</button>
        </header>

        <div className="content">
          <div className="eyebrow">{t.overview}</div>
          <div className="title-row"><div><h1>{t.commandCenter}</h1><p>{t.commandSubtitle}</p></div><div className="balanced-pill"><span />{t.booksBalanced}</div></div>

          <section className="metric-grid" aria-label={t.commandCenter}>
            {metrics.map((metric) => <article className="metric" key={metric}><p>{t[metric]}</p><strong className="financial-number" dir="ltr">{money.format(0)}</strong><span>{t.noChange}</span></article>)}
          </section>

          <section className="main-grid">
            <RuntimeAccessPanel
              runtime={runtime}
              text={runtimeText}
              foundation={t.foundation}
              onSignIn={signIn}
              onSignOut={signOut}
              onRetry={() => { if (runtime.user) void loadScope(runtime.user); else void checkSession(); }}
              onTenantChange={(tenantId) => { void selectTenant(tenantId); }}
              onCompanyChange={(companyId) => setRuntime((current) => ({ ...current, companyId }))}
            />
            <article className="balance-panel">
              <div className="balance-orbit"><span className="check">✓</span></div><h2>{t.booksBalanced}</h2><p>{t.difference}</p>
              <strong className="financial-number" dir="ltr">{money.format(0)}</strong>
            </article>
          </section>

          <section className="lower-grid">
            <article><div className="section-head"><h2>{t.activity}</h2><span>UTC · {t.live}</span></div><div className="empty-state"><span className="empty-mark" /><p>{t.emptyActivity}</p></div></article>
            <article><div className="section-head"><h2>{t.closeTitle}</h2><span>0 / 9</span></div><div className="close-track"><span /></div><p className="muted">{t.closeBody}</p></article>
          </section>
        </div>
      </main>
    </div>
  );
}

type RuntimeText = (typeof RUNTIME_CATALOGS)[UiLocale];

function RuntimeAccessPanel({
  runtime,
  text,
  foundation,
  onSignIn,
  onSignOut,
  onRetry,
  onTenantChange,
  onCompanyChange,
}: Readonly<{
  runtime: RuntimeView;
  text: RuntimeText;
  foundation: string;
  onSignIn(form: HTMLFormElement): Promise<void>;
  onSignOut(): Promise<void>;
  onRetry(): void;
  onTenantChange(tenantId: string): void;
  onCompanyChange(companyId: string): void;
}>) {
  const reference = runtime.reference
    ? <small className="runtime-reference">{text.reference}: <bdi>{runtime.reference}</bdi></small>
    : null;

  if (runtime.phase === 'anonymous' || runtime.phase === 'signing-in') {
    return (
      <article className="setup-panel runtime-panel">
        <div className="panel-kicker">01 · {foundation}</div>
        <h2>{text.signInTitle}</h2><p>{text.signInBody}</p>
        {runtime.notice === 'invalid-credentials' ? <p className="runtime-notice" role="alert">{text.invalidCredentials}</p> : null}
        {runtime.notice === 'session-expired' ? <p className="runtime-notice" role="status">{text.sessionExpired}</p> : null}
        {reference}
        <form className="runtime-form" onSubmit={(event) => { event.preventDefault(); void onSignIn(event.currentTarget); }}>
          <label><span>{text.email}</span><input name="email" type="email" autoComplete="username" inputMode="email" maxLength={254} required /></label>
          <label><span>{text.password}</span><input name="password" type="password" autoComplete="current-password" maxLength={128} required /></label>
          <button type="submit" disabled={runtime.phase === 'signing-in'}>{runtime.phase === 'signing-in' ? text.signingIn : text.signIn}</button>
        </form>
      </article>
    );
  }

  if (runtime.phase === 'ready' || runtime.phase === 'loading-companies' || runtime.phase === 'no-companies') {
    return (
      <article className="setup-panel runtime-panel">
        <div className="panel-kicker">01 · {foundation}</div>
        <h2>{runtime.user ? `${text.signedInAs} ${runtime.user.displayName}` : text.loadingSession}</h2>
        <div className="runtime-selectors">
          <label><span>{text.organization}</span><select value={runtime.tenantId} onChange={(event) => onTenantChange(event.target.value)}>{runtime.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.role}</option>)}</select></label>
          <label><span>{text.selectCompany}</span><select value={runtime.companyId} disabled={runtime.phase === 'loading-companies' || runtime.companies.length === 0} onChange={(event) => onCompanyChange(event.target.value)}><option value="">{runtime.phase === 'loading-companies' ? text.companiesLoading : text.selectCompany}</option>{runtime.companies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.baseCurrency}</option>)}</select></label>
        </div>
        {runtime.phase === 'no-companies' ? <><h3>{text.noCompaniesTitle}</h3><p>{text.noCompaniesBody}</p></> : null}
        <button type="button" onClick={() => { void onSignOut(); }}>{text.signOut}</button>
      </article>
    );
  }

  const isLoading = runtime.phase === 'checking' || runtime.phase === 'loading-organizations';
  const title = isLoading
    ? (runtime.phase === 'checking' ? text.loadingSession : text.loadingOrganizations)
    : runtime.phase === 'no-organizations'
      ? text.noOrganizationsTitle
      : runtime.phase === 'forbidden'
        ? text.forbiddenTitle
        : runtime.phase === 'offline' || runtime.phase === 'disconnected'
          ? text.offlineTitle
          : text.errorTitle;
  const body = runtime.phase === 'no-organizations'
    ? text.noOrganizationsBody
    : runtime.phase === 'forbidden'
      ? text.forbiddenBody
      : runtime.phase === 'offline' || runtime.phase === 'disconnected'
        ? text.offlineBody
        : isLoading ? '' : text.errorBody;
  return (
    <article className="setup-panel runtime-panel" aria-live="polite">
      <div className="panel-kicker">01 · {foundation}</div>
      <h2>{title}</h2>{body ? <p>{body}</p> : null}{reference}
      {!isLoading && runtime.phase !== 'disconnected' ? <button type="button" onClick={onRetry}>{text.retry}</button> : null}
      {runtime.user ? <button className="runtime-secondary" type="button" onClick={() => { void onSignOut(); }}>{text.signOut}</button> : null}
    </article>
  );
}

function initials(displayName: string): string {
  const segments = displayName.trim().split(/\s+/u).filter(Boolean);
  const value = segments.slice(0, 2).map((segment) => Array.from(segment)[0] ?? '').join('');
  return value.toLocaleUpperCase().slice(0, 2) || 'AM';
}
