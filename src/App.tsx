/**
 * @fileoverview Componente principal de DriftBrief.
 * Integra todos los componentes y gestiona el estado de la aplicación.
 */

import { useState, useMemo, lazy, Suspense } from 'react';
import type { TransitionId, UserRole, Snapshot } from './types';
import { useAgentDrift } from './hooks/useAgentDrift';
import { Header } from './components/Header';
import { IncidentCard } from './components/IncidentCard';
import { SnapshotSelector } from './components/SnapshotSelector';
import { DriftBanner } from './components/DriftBanner';
import { DeltaCard } from './components/DeltaCard';
import { DecisionCard } from './components/DecisionCard';
import { RoleSwitcher } from './components/RoleSwitcher';
import snapshotsData from './data/snapshots.json';
import './styles/tokens.css';
import './App.css';

// Lazy-loaded panels (code-split into separate chunks)
const ComparisonPanel = lazy(() => import('./components/ComparisonPanel').then(m => ({ default: m.ComparisonPanel })));
const BriefExportPanel = lazy(() => import('./components/BriefExportPanel').then(m => ({ default: m.BriefExportPanel })));

const snapshots: Snapshot[] = snapshotsData as Snapshot[];

/**
 * Componente raíz de la aplicación DriftBrief.
 * @returns Elemento JSX de la aplicación completa
 */
function App() {
  const [activeTransition, setActiveTransition] = useState<TransitionId>('A-B');
  const [activeRole, setActiveRole] = useState<UserRole>('soc');

  const { fromSnapshot, toSnapshot } = useMemo(() => {
    const [fromId, toId] = activeTransition.split('-');
    const from = snapshots.find((s) => s.id === fromId);
    const to = snapshots.find((s) => s.id === toId);
    return { fromSnapshot: from!, toSnapshot: to! };
  }, [activeTransition]);

  const { drift, source, fallbackReason, isEnriching } = useAgentDrift(fromSnapshot, toSnapshot);

  const filteredActions = useMemo(() => {
    return drift.recommendedActions
      .filter((a) => a.role === activeRole)
      .sort((a, b) => a.priority - b.priority);
  }, [drift.recommendedActions, activeRole]);

  const sourceClassName = isEnriching
    ? 'app__drift-source app__drift-source--loading'
    : `app__drift-source app__drift-source--${source}`;

  return (
    <div className="app">
      <Header />

      <main className="app__main">
        <IncidentCard />

        <section className="app__controls">
          <SnapshotSelector
            activeTransition={activeTransition}
            onTransitionChange={setActiveTransition}
          />
          <RoleSwitcher
            activeRole={activeRole}
            onRoleChange={setActiveRole}
          />
        </section>

        <DriftBanner headline={drift.headline} />

        <div className={sourceClassName}>
          {isEnriching
            ? '⏳ Consultando agente IA...'
            : `🔌 Fuente: ${source.toUpperCase()}${fallbackReason ? ` — ${fallbackReason}` : ''}`
          }
        </div>

        <Suspense fallback={<div className="app__lazy-fallback">Cargando panel...</div>}>
          <ComparisonPanel
            fromSnapshot={fromSnapshot}
            toSnapshot={toSnapshot}
            activeRole={activeRole}
          />
        </Suspense>

        <section className="app__deltas">
          <DeltaCard
            title="Nuevos Hechos Confirmados"
            icon="📋"
            variant="confirmed"
            facts={drift.newFacts}
          />
          <DeltaCard
            title="Nuevos IOCs Detectados"
            icon="🎯"
            variant="critical"
            iocs={drift.newIOCs}
          />
          {drift.confidenceShifts.length > 0 && (
            <DeltaCard
              title="Giros de Confianza"
              icon="🔄"
              variant="probable"
              shifts={drift.confidenceShifts}
            />
          )}
        </section>

        <DecisionCard decision={drift.urgentDecision} />

        <section className="app__actions">
          <h3 className="app__actions-title">
            Acciones Recomendadas ({activeRole.toUpperCase()})
          </h3>
          <ol className="app__actions-list">
            {filteredActions.map((action, index) => (
              <li key={index} className="app__action-item">
                {action.description}
              </li>
            ))}
          </ol>
        </section>

        <Suspense fallback={<div className="app__lazy-fallback">Cargando exportación...</div>}>
          <BriefExportPanel
            socBriefing={drift.socBriefing}
            cisoBriefing={drift.cisoBriefing}
            activeRole={activeRole}
          />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
