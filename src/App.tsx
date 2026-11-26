import { Link, Route, Switch } from 'wouter';
import { useT } from './i18n';
import { LangSwitch } from './ui/common/LangSwitch';
import { DiagnosticsPage } from './ui/diagnostics/DiagnosticsPage';

function Home() {
  const { t } = useT();
  return (
    <main className="page">
      <h1>GhostEQ</h1>
      <p className="slogan">{t('app.slogan')}</p>
      <p className="muted">{t('app.wip')}</p>
      <Link href="/diagnostico" className="button">
        {t('nav.diagnostics')}
      </Link>
    </main>
  );
}

export function App() {
  const { t } = useT();
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          GhostEQ
        </Link>
        <nav>
          <Link href="/diagnostico">{t('nav.diagnostics')}</Link>
        </nav>
        <LangSwitch />
      </header>
      <Switch>
        <Route path="/diagnostico" component={DiagnosticsPage} />
        <Route component={Home} />
      </Switch>
    </>
  );
}
