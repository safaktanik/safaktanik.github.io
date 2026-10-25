import { useState } from 'react';
import { arenaClient, errorText } from '../client';
import { ECONOMY } from '../economy';
import { BackIcon, MineIcon } from './icons';
import { Coin, Spinner } from './common';

export function AuthScreen({ onExit, onPractice }: { onExit(): void; onPractice(): void }) {
  const [mode, setMode] = useState<'start' | 'login' | 'register'>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = arenaClient();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ar-root ascreen auth">
      <button type="button" className="aback" onClick={mode === 'start' ? onExit : () => setMode('start')}>
        <BackIcon size={18} /> {mode === 'start' ? 'Ana menü' : 'Geri'}
      </button>
      <header className="auth__hero">
        <div className="auth__logo">
          <MineIcon size={46} />
        </div>
        <p className="aeyebrow">Çok oyunculu masalar</p>
        <h1>Mine Duel Arena</h1>
        <p className="amuted">3–4 kişilik masalarda ortak mayın tarlası. Üç canın var; son kalan havuzu alır.</p>
      </header>

      {mode === 'start' ? (
        <div className="auth__actions">
          <button type="button" className="abtn abtn--gold abtn--xl" disabled={busy} onClick={() => run(() => c.guest())}>
            {busy ? <Spinner /> : null} Misafir olarak oyna
          </button>
          <p className="asmall amuted center">
            Misafirlere <Coin size={14} /> {ECONOMY.startingBalance.toLocaleString('tr-TR')} {ECONOMY.currency} verilir. İlerlemen bu tarayıcıdaki oturuma bağlıdır; istediğin zaman kalıcı hesaba dönüştürebilirsin.
          </p>
          <div className="auth__row">
            <button type="button" className="abtn abtn--ghost" onClick={() => setMode('login')}>
              Giriş yap
            </button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setMode('register')}>
              Hesap oluştur
            </button>
          </div>
          <button type="button" className="abtn abtn--ghost" onClick={onPractice}>
            Botlarla antrenman (sunucusuz)
          </button>
        </div>
      ) : (
        <form
          className="auth__form apanel"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => (mode === 'login' ? c.login(email, password) : c.register(email, password, username)));
          }}
        >
          <h2>{mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}</h2>
          <label className="afield">
            <span>E-posta</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="afield">
            <span>Parola {mode === 'register' ? '(en az 8 karakter)' : ''}</span>
            <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {mode === 'register' ? (
            <label className="afield">
              <span>Kullanıcı adı (isteğe bağlı)</span>
              <input maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–16 harf/rakam" />
            </label>
          ) : null}
          <button type="submit" className="abtn abtn--primary abtn--lg" disabled={busy}>
            {busy ? <Spinner /> : null} {mode === 'login' ? 'Giriş yap' : 'Hesabı oluştur'}
          </button>
          <p className="asmall amuted">Parolan sunucuda yalnızca özet (scrypt) olarak saklanır. Google/Apple ile giriş bu sürümde yok.</p>
        </form>
      )}
      {err ? <p className="aerror" role="alert">{err}</p> : null}
    </div>
  );
}
