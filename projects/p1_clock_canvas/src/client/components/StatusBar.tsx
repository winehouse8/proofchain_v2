// Clock Canvas - Bottom Status Bar
// REQ-CV-018: node count, connection count, CDC warning count

import { useAppState } from '../store.js';

export default function StatusBar() {
  const { nodes, edges, cdcCrossings, projectId } = useAppState();

  return (
    <div className="status-bar">
      <div className="status-bar-item">
        Nodes: {nodes.length}
      </div>
      <div className="status-bar-item">
        Connections: {edges.length}
      </div>
      <div className={`status-bar-item${cdcCrossings.length > 0 ? ' status-bar-item--warning' : ''}`}>
        CDC Warnings: {cdcCrossings.length}
      </div>
      <div className="status-bar-spacer" />
      <div className="status-bar-item">
        {projectId ? 'Connected' : 'No project'}
      </div>
    </div>
  );
}
