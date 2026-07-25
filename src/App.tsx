/**
 * @fileoverview Componente principal de DriftBrief.
 * Integra todos los componentes y gestiona el estado de la aplicación.
 */

import { useState, useMemo, lazy, Suspense } from 'react';
import type { TransitionId, UserRole, Snapshot, TelemetryData, SeverityLevel, TimelineNode } from './types';
import { useAgentDrift } from './hooks/useAgentDrift';
import { useTelemetryToggle } from './hooks/useTelemetryToggle';
import { Header } from './components/Header';
import { BusinessHeader } from './components/BusinessHeader';
import { SECURITY_KNOWLEDGE_BASE } from './services/knowledgeBase';
import { IncidentCard } from './components/IncidentCard';
import { IncidentTimeline } from './components/IncidentTimeline';
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
const TelemetryPanel = lazy(() => import('./components/TelemetryPanel').then(m => ({ default: m.TelemetryPanel })));

const snapshots: Snapshot[] = snapshotsData as Snapshot[];

/**
 * Mapea un nivel de severidad a su riesgo financiero estimado en USD por hora.
 * @param severity - Nivel de severidad del incidente
 * @returns Exposición financiera estimada en USD
 */
function severityToFinancialRisk(severity: SeverityLevel): number {
  switch (severity) {
    case 'critical': return 150000;
    case 'high': return 50000;
    case 'medium': return 10000;
    case 'low': return 0;
  }
}

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

  /**
   * Maps snapshot data to TimelineNode[] for the IncidentTimeline component.
   * Formats ISO timestamps to localized time strings (e.g., "02:30 AM").
   */
  const timelineNodes: TimelineNode[] = useMemo(() => {
    return snapshots.map((snapshot, index) => ({
      id: snapshot.id,
      label: `Snapshot ${index + 1}: ${snapshot.title}`,
      time: new Date(snapshot.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      severity: snapshot.severity,
    }));
  }, []);

  /** Derives the active node ID from the current transition (the "to" endpoint). */
  const activeNodeId = useMemo(() => {
    const [, toId] = activeTransition.split('-');
    return toId;
  }, [activeTransition]);

  /**
   * Handles timeline node clicks by updating the active transition.
   * Clicking node B sets transition "A-B", clicking node C sets "B-C".
   * Clicking node A (always origin) keeps transition at "A-B".
   */
  const handleTimelineNodeClick = (nodeId: string): void => {
    if (nodeId === 'B') {
      setActiveTransition('A-B');
    } else if (nodeId === 'C') {
      setActiveTransition('B-C');
    }
    // Clicking "A" doesn't change transition — it's always the origin
  };

  const { drift, source, fallbackReason, telemetry } = useAgentDrift(fromSnapshot, toSnapshot);

  // Log provider status to console only (never show in UI)
  if (import.meta.env.DEV && fallbackReason) {
    console.warn(`[DriftBrief] Provider fallback: ${source.toUpperCase()} — ${fallbackReason}`);
  }
  const { isVisible } = useTelemetryToggle();
  const telemetryEnabled = import.meta.env.VITE_SHOW_TELEMETRY === 'true';

  const telemetryData: TelemetryData = telemetry ?? {
    tokensConsumed: null,
    latencyMs: null,
    estimatedCost: null,
  };

  const filteredActions = useMemo(() => {
    return drift.recommendedActions
      .filter((a) => a.role === activeRole)
      .sort((a, b) => a.priority - b.priority);
  }, [drift.recommendedActions, activeRole]);

  return (
    <div className="app">
      <Header />

      <BusinessHeader
        automatedTimeSeconds={12}
        manualTimeSeconds={2700}
        severity={toSnapshot.severity}
        financialExposureUsd={severityToFinancialRisk(toSnapshot.severity)}
        regulations={SECURITY_KNOWLEDGE_BASE.regulations}
      />

      <main className="app__main">
        <IncidentCard />

        <IncidentTimeline
          nodes={timelineNodes}
          activeNodeId={activeNodeId}
          activeTransition={{ from: activeTransition.split('-')[0], to: activeTransition.split('-')[1] }}
          onNodeClick={handleTimelineNodeClick}
        />

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

        <div key={`banner-${activeTransition}`} className="drift-animate-in">
          <DriftBanner headline={drift.headline} />
        </div>



        <Suspense key={`panel-${activeTransition}-${activeRole}`} fallback={<div className="app__lazy-fallback">Cargando panel...</div>}>
          <ComparisonPanel
            fromSnapshot={fromSnapshot}
            toSnapshot={toSnapshot}
            activeRole={activeRole}
          />
        </Suspense>

        <section key={`deltas-${activeTransition}`} className="app__deltas drift-animate-in">
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

        <div key={`decision-${activeTransition}`} className="drift-animate-in">
          <DecisionCard decision={drift.urgentDecision} activeRole={activeRole} />
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

        <Suspense fallback={<div className="app__lazy-fallback">Cargando exportación...</div>}>
          <BriefExportPanel
            socBriefing={drift.socBriefing}
            cisoBriefing={drift.cisoBriefing}
            activeRole={activeRole}
          />
        </Suspense>
      </main>

      {telemetryEnabled && isVisible && (
        <Suspense fallback={null}>
          <TelemetryPanel data={telemetryData} source={source} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
