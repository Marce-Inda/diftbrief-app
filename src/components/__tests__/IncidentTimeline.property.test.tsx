/**
 * @fileoverview Property-based tests for IncidentTimeline component.
 * Feature: incident-timeline
 * Validates: Requirements 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1
 */

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { render, fireEvent } from '@testing-library/react';
import { IncidentTimeline } from '../IncidentTimeline';
import type { TimelineNode } from '../../types';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const severityArb = fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<TimelineNode['severity']>;

const timelineNodeArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
  label: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  time: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
  severity: severityArb,
}) as fc.Arbitrary<TimelineNode>;

/** Generate arrays of TimelineNodes with unique IDs */
const timelineNodesArb = (minLength = 0, maxLength = 10) =>
  fc.array(timelineNodeArb, { minLength, maxLength }).map(nodes => {
    // Ensure unique IDs
    const seen = new Set<string>();
    return nodes.filter(node => {
      if (seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    });
  });

// ─── Property 1: Node count consistency ───────────────────────────────────────

describe('Property 1: Node count consistency', () => {
  it('renders exactly as many node elements as items in the input array', () => {
    fc.assert(
      fc.property(timelineNodesArb(0, 8), (nodes) => {
        const { container } = render(<IncidentTimeline nodes={nodes} />);
        const renderedNodes = container.querySelectorAll('.incident-timeline__node');
        expect(renderedNodes.length).toBe(nodes.length);
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Property 2: Connector count consistency ──────────────────────────────────

describe('Property 2: Connector count consistency', () => {
  it('renders exactly N-1 connectors for N nodes', () => {
    fc.assert(
      fc.property(timelineNodesArb(0, 8), (nodes) => {
        const { container } = render(<IncidentTimeline nodes={nodes} />);
        const connectors = container.querySelectorAll('.incident-timeline__connector');
        const expected = nodes.length > 0 ? nodes.length - 1 : 0;
        expect(connectors.length).toBe(expected);
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Property 3: Active node uniqueness ───────────────────────────────────────

describe('Property 3: Active node uniqueness', () => {
  it('applies active class to exactly one node when activeNodeId matches', () => {
    fc.assert(
      fc.property(
        timelineNodesArb(1, 8).chain(nodes =>
          fc.tuple(fc.constant(nodes), fc.constantFrom(...nodes.map(n => n.id)))
        ),
        ([nodes, activeId]) => {
          const { container } = render(
            <IncidentTimeline nodes={nodes} activeNodeId={activeId} />,
          );
          const activeNodes = container.querySelectorAll('.incident-timeline__node--active');
          expect(activeNodes.length).toBe(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('applies no active class when activeNodeId does not match any node', () => {
    fc.assert(
      fc.property(timelineNodesArb(1, 8), (nodes) => {
        const invalidId = '__nonexistent_id__';
        const { container } = render(
          <IncidentTimeline nodes={nodes} activeNodeId={invalidId} />,
        );
        const activeNodes = container.querySelectorAll('.incident-timeline__node--active');
        expect(activeNodes.length).toBe(0);
      }),
      { numRuns: 30 },
    );
  });
});

// ─── Property 4: Transition highlights both endpoints ─────────────────────────

describe('Property 4: Transition highlights both endpoints', () => {
  it('highlights exactly two nodes when activeTransition references two valid nodes', () => {
    fc.assert(
      fc.property(
        timelineNodesArb(2, 8).chain(nodes => {
          const ids = nodes.map(n => n.id);
          return fc.tuple(
            fc.constant(nodes),
            fc.constantFrom(...ids),
            fc.constantFrom(...ids),
          ).filter(([, from, to]) => from !== to);
        }),
        ([nodes, from, to]) => {
          const { container } = render(
            <IncidentTimeline nodes={nodes} activeTransition={{ from, to }} />,
          );
          const activeNodes = container.querySelectorAll('.incident-timeline__node--active');
          expect(activeNodes.length).toBe(2);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Property 5: Click callback correctness ──────────────────────────────────

describe('Property 5: Click callback correctness', () => {
  it('invokes onNodeClick with the correct node ID when clicked', () => {
    fc.assert(
      fc.property(
        timelineNodesArb(1, 6).chain(nodes =>
          fc.tuple(
            fc.constant(nodes),
            fc.integer({ min: 0, max: nodes.length - 1 }),
          )
        ),
        ([nodes, clickIndex]) => {
          const onNodeClick = vi.fn();
          const { container } = render(
            <IncidentTimeline nodes={nodes} onNodeClick={onNodeClick} />,
          );
          const nodeElements = container.querySelectorAll('.incident-timeline__node');
          fireEvent.click(nodeElements[clickIndex]);
          expect(onNodeClick).toHaveBeenCalledWith(nodes[clickIndex].id);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('invokes onNodeClick via keyboard Enter key', () => {
    fc.assert(
      fc.property(
        timelineNodesArb(1, 6).chain(nodes =>
          fc.tuple(
            fc.constant(nodes),
            fc.integer({ min: 0, max: nodes.length - 1 }),
          )
        ),
        ([nodes, clickIndex]) => {
          const onNodeClick = vi.fn();
          const { container } = render(
            <IncidentTimeline nodes={nodes} onNodeClick={onNodeClick} />,
          );
          const nodeElements = container.querySelectorAll('.incident-timeline__node');
          fireEvent.keyDown(nodeElements[clickIndex], { key: 'Enter' });
          expect(onNodeClick).toHaveBeenCalledWith(nodes[clickIndex].id);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('invokes onNodeClick via keyboard Space key', () => {
    fc.assert(
      fc.property(
        timelineNodesArb(1, 6).chain(nodes =>
          fc.tuple(
            fc.constant(nodes),
            fc.integer({ min: 0, max: nodes.length - 1 }),
          )
        ),
        ([nodes, clickIndex]) => {
          const onNodeClick = vi.fn();
          const { container } = render(
            <IncidentTimeline nodes={nodes} onNodeClick={onNodeClick} />,
          );
          const nodeElements = container.querySelectorAll('.incident-timeline__node');
          fireEvent.keyDown(nodeElements[clickIndex], { key: ' ' });
          expect(onNodeClick).toHaveBeenCalledWith(nodes[clickIndex].id);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ─── Property 6: Severity glow mapping ───────────────────────────────────────

describe('Property 6: Severity glow mapping', () => {
  it('applies the correct glow class based on node severity', () => {
    fc.assert(
      fc.property(timelineNodesArb(1, 8), (nodes) => {
        const { container } = render(<IncidentTimeline nodes={nodes} />);
        const nodeElements = container.querySelectorAll('.incident-timeline__node');

        nodes.forEach((node, index) => {
          const el = nodeElements[index];
          switch (node.severity) {
            case 'critical':
              expect(el.classList.contains('incident-timeline__node--glow-critical')).toBe(true);
              break;
            case 'high':
              expect(el.classList.contains('incident-timeline__node--glow-high')).toBe(true);
              break;
            case 'medium':
              expect(el.classList.contains('incident-timeline__node--glow-medium')).toBe(true);
              break;
            case 'low':
              expect(el.classList.contains('incident-timeline__node--glow-critical')).toBe(false);
              expect(el.classList.contains('incident-timeline__node--glow-high')).toBe(false);
              expect(el.classList.contains('incident-timeline__node--glow-medium')).toBe(false);
              break;
          }
        });
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Property 7: Node content completeness ───────────────────────────────────

describe('Property 7: Node content completeness', () => {
  it('each node displays time, label, and severity badge', () => {
    fc.assert(
      fc.property(timelineNodesArb(1, 6), (nodes) => {
        const { container } = render(<IncidentTimeline nodes={nodes} />);
        const nodeElements = container.querySelectorAll('.incident-timeline__node');

        nodes.forEach((node, index) => {
          const el = nodeElements[index];
          const timeEl = el.querySelector('.incident-timeline__time');
          const labelEl = el.querySelector('.incident-timeline__label');
          const badgeEl = el.querySelector('.incident-timeline__badge');

          expect(timeEl).not.toBeNull();
          expect(labelEl).not.toBeNull();
          expect(badgeEl).not.toBeNull();

          expect(timeEl!.textContent).toBe(node.time);
          expect(labelEl!.textContent).toBe(node.label);
          expect(badgeEl!.textContent).toBe(node.severity.toUpperCase());
        });
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('renders empty container without errors when nodes array is empty', () => {
    const { container } = render(<IncidentTimeline nodes={[]} />);
    const timeline = container.querySelector('.incident-timeline');
    expect(timeline).not.toBeNull();
    expect(timeline!.children.length).toBe(0);
  });

  it('renders single node without connectors', () => {
    const singleNode: TimelineNode[] = [
      { id: 'A', label: 'Snapshot 1', time: '08:00 AM', severity: 'medium' },
    ];
    const { container } = render(<IncidentTimeline nodes={singleNode} />);
    const nodes = container.querySelectorAll('.incident-timeline__node');
    const connectors = container.querySelectorAll('.incident-timeline__connector');
    expect(nodes.length).toBe(1);
    expect(connectors.length).toBe(0);
  });

  it('does not crash when onNodeClick is not provided', () => {
    const nodes: TimelineNode[] = [
      { id: 'A', label: 'Test', time: '09:00 AM', severity: 'low' },
    ];
    const { container } = render(<IncidentTimeline nodes={nodes} />);
    const nodeEl = container.querySelector('.incident-timeline__node')!;
    expect(() => fireEvent.click(nodeEl)).not.toThrow();
  });

  it('handles activeTransition with non-existent node IDs gracefully', () => {
    const nodes: TimelineNode[] = [
      { id: 'A', label: 'Node A', time: '08:00', severity: 'low' },
      { id: 'B', label: 'Node B', time: '09:00', severity: 'high' },
    ];
    const { container } = render(
      <IncidentTimeline
        nodes={nodes}
        activeTransition={{ from: 'X', to: 'Y' }}
      />,
    );
    const activeNodes = container.querySelectorAll('.incident-timeline__node--active');
    expect(activeNodes.length).toBe(0);
  });
});
