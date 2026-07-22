/**
 * @fileoverview Componente principal de DriftBrief.
 * Integra todos los componentes y gestiona el estado de la aplicación.
 */

import { useState, useMemo, useEffect } from 'react';
import type { TransitionId, UserRole, Snapshot, Drift } from './types';
import { calculateDrift } from './services/driftComparator';
import { getAgentDrift } from './services/agentService';
import type { DriftSource } from './services/agentService';
import { Header } from './components/Header';
import { IncidentCard } from './components/IncidentCard';
import { SnapshotSelector } from './components/SnapshotSelector';
import { DriftBanner } from './components/DriftBanner';
import { ComparisonPanel } from './components/ComparisonPanel';
import { DeltaCard } from './components/DeltaCard';
import { DecisionCard } from './components/DecisionCard';
import { RoleSwitcher } from './components/RoleSwitcher';
import { BriefExportPanel } from './components/BriefExportPanel';
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

  // Drift inmediato del motor local (garantiza renderizado instantáneo)
  const localDrift = useMemo(() => {
    return calculateDrift(fromSnapshot, toSnapshot);
  }, [fromSnapshot, toSnapshot]);

  // Estado del drift enriquecido por IA (async con fallback)
  const [drift, setDrift] = useState<Drift>(localDrift);
  const [driftSource, setDriftSource] = useState<DriftSource>('local');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();

  useEffect(() => {
    // Primero renderizamos con el local, luego intentamos enriquecer con IA
    setDrift(localDrift);
    setDriftSource('local');
    setFallbackReason(undefined);

    let cancelled = false;
    getAgentDrift(fromSnapshot, toSnapshot).then((result) => {
      if (!cancelled) {
        setDrift(result.drift);
        setDriftSource(result.source);
        setFallbackReason(result.fallbackReason);
      }
    });

    return () => { cancelled = true; };
  }, [fromSnapshot, toSnapshot, localDrift]);

  const filteredActions = useMemo(() => {
    return drift.recommendedActions
      .filter((a) => a.role === activeRole)
      .sort((a, b) => a.priority - b.priority);
  }, [drift.recommendedActions, activeRole]);

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

        {/* Indicador de fuente del drift (para chaos testing) */}
        <div className="app__drift-source" style={{
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          fontSize: '0.8rem',
          background: driftSource === 'gemini' ? 'var(--color-confirmed)' :
                     driftSource === 'groq' ? 'var(--color-probable)' :
                     'var(--color-drift)',
          color: 'var(--color-bg-base)',
          fontWeight: 600,
          display: 'inline-block',
          marginBottom: '1rem',
        }}>
          🔌 Fuente: {driftSource.toUpperCase()}
          {fallbackReason && ` — ${fallbackReason}`}
        </div>

        <ComparisonPanel
          fromSnapshot={fromSnapshot}
          toSnapshot={toSnapshot}
          activeRole={activeRole}
        />

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

        <BriefExportPanel
          socBriefing={drift.socBriefing}
          cisoBriefing={drift.cisoBriefing}
          activeRole={activeRole}
        />
      </main>
    </div>
  );
}

export default App;
