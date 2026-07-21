/**
 * @fileoverview Componente principal de DriftBrief.
 * Integra todos los componentes y gestiona el estado de la aplicación.
 */

import { useState, useMemo, useEffect } from 'react';
import type { TransitionId, UserRole, Snapshot, Drift } from './types';
import { calculateDrift } from './services/driftComparator';
import { enrichDriftWithAI } from './services/agentService';
import { Header } from './components/Header';
import { IncidentCard } from './components/IncidentCard';
import { SnapshotSelector } from './components/SnapshotSelector';
import { DriftBanner } from './components/DriftBanner';
import { ComparisonPanel } from './components/ComparisonPanel';
import { DeltaCard } from './components/DeltaCard';
import { DecisionCard } from './components/DecisionCard';
import { RoleSwitcher } from './components/RoleSwitcher';
import { BriefExportPanel } from './components/BriefExportPanel';
import { ImpactCard } from './components/ImpactCard';
import snapshotsData from './data/snapshots.json';
import './styles/tokens.css';
import './App.css';

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

  const baseDrift = useMemo(() => {
    return calculateDrift(fromSnapshot, toSnapshot);
  }, [fromSnapshot, toSnapshot]);

  const [enrichedDrift, setEnrichedDrift] = useState<Drift>(baseDrift);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);



  useEffect(() => {
    let cancelled = false;

    setIsEnriching(true);
    setEnrichedDrift(baseDrift);

    enrichDriftWithAI(fromSnapshot, toSnapshot, baseDrift).then((result) => {
      if (!cancelled) {
        setEnrichedDrift(result);
        setIsEnriching(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fromSnapshot, toSnapshot, baseDrift]);

  const filteredActions = useMemo(() => {
    return enrichedDrift.recommendedActions
      .filter((a) => a.role === activeRole)
      .sort((a, b) => a.priority - b.priority);
  }, [enrichedDrift.recommendedActions, activeRole]);

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

        <DriftBanner headline={enrichedDrift.headline} role={activeRole} />

        {isEnriching && (
          <div className="app__ai-loading" role="status" aria-live="polite">
            <span className="app__ai-loading-icon" aria-hidden="true">🤖</span>
            <span className="app__ai-loading-text">
              Analizando telemetría y redactando briefings con IA...
            </span>
          </div>
        )}

        <ComparisonPanel
          fromSnapshot={fromSnapshot}
          toSnapshot={toSnapshot}
          activeRole={activeRole}
        />

        <div className="app__role-content" key={activeRole}>
          {activeRole === 'soc' && (
            <section className="app__deltas">
              <DeltaCard
                title="Nuevos Hechos Confirmados"
                icon="📋"
                variant="confirmed"
                facts={enrichedDrift.newFacts}
              />
              <DeltaCard
                title="Nuevos IOCs Detectados"
                icon="🎯"
                variant="critical"
                iocs={enrichedDrift.newIOCs}
              />
              {enrichedDrift.confidenceShifts.length > 0 && (
                <DeltaCard
                  title="Giros de Confianza"
                  icon="🔄"
                  variant="probable"
                  shifts={enrichedDrift.confidenceShifts}
                />
              )}
            </section>
          )}

          {activeRole === 'ciso' && (
            <>
              <DecisionCard decision={enrichedDrift.urgentDecision} />
              <ImpactCard severityChange={enrichedDrift.severityChange} />
            </>
          )}
        </div>

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

        <BriefExportPanel
          socBriefing={enrichedDrift.socBriefing}
          cisoBriefing={enrichedDrift.cisoBriefing}
          activeRole={activeRole}
        />
      </main>
    </div>
  );
}

export default App;
