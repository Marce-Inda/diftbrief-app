import './IncidentTimeline.css';
import type { IncidentTimelineProps, TimelineNode } from '../types/index';

/**
 * IncidentTimeline — Horizontal timeline component that visualizes the chronological
 * progression of an active cybersecurity incident through connected snapshot nodes.
 *
 * Each node displays its timestamp, label, and severity badge. Nodes are connected
 * by horizontal lines. Active states and severity-based glow effects provide immediate
 * visual feedback on the current selection and escalation level.
 *
 * @param props - Timeline configuration including nodes, active state, and click handler
 * @returns A horizontal timeline of connected incident snapshot nodes
 */
export function IncidentTimeline({
  nodes,
  activeNodeId,
  activeTransition,
  onNodeClick,
}: IncidentTimelineProps) {
  /**
   * Determines whether a given node should be rendered with the active highlight.
   * A node is active if its ID matches activeNodeId, or if it participates as the
   * `from` or `to` endpoint of the current activeTransition.
   */
  const isNodeActive = (node: TimelineNode): boolean => {
    if (activeNodeId && node.id === activeNodeId) return true;
    if (activeTransition) {
      return node.id === activeTransition.from || node.id === activeTransition.to;
    }
    return false;
  };

  /**
   * Maps a severity level to its corresponding glow CSS class.
   * Low severity receives no glow effect.
   */
  const getGlowClass = (severity: TimelineNode['severity']): string => {
    switch (severity) {
      case 'critical':
        return 'incident-timeline__node--glow-critical';
      case 'high':
        return 'incident-timeline__node--glow-high';
      case 'medium':
        return 'incident-timeline__node--glow-medium';
      default:
        return '';
    }
  };

  /**
   * Builds the full className string for a timeline node based on its
   * active state and severity level.
   */
  const getNodeClassName = (node: TimelineNode): string => {
    const classes = ['incident-timeline__node'];
    if (isNodeActive(node)) {
      classes.push('incident-timeline__node--active');
    }
    const glow = getGlowClass(node.severity);
    if (glow) {
      classes.push(glow);
    }
    return classes.join(' ');
  };

  return (
    <div className="incident-timeline">
      {nodes.map((node, index) => (
        <span key={node.id}>
          <div
            className={getNodeClassName(node)}
            onClick={() => onNodeClick?.(node.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onNodeClick?.(node.id);
              }
            }}
          >
            <span className="incident-timeline__time">{node.time}</span>
            <span className="incident-timeline__label">{node.label}</span>
            <span className={`incident-timeline__badge incident-timeline__badge--${node.severity}`}>
              {node.severity.toUpperCase()}
            </span>
          </div>
          {index < nodes.length - 1 && (
            <div className="incident-timeline__connector" />
          )}
        </span>
      ))}
    </div>
  );
}

export default IncidentTimeline;
