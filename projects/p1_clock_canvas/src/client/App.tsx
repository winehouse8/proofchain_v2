// Clock Canvas - Main App with Layout

import { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useAppState } from './store.js';
import Toolbar from './components/Toolbar.js';
import Palette from './components/Palette.js';
import Canvas from './components/Canvas.js';
import PropertyPanel from './components/PropertyPanel.js';
import StatusBar from './components/StatusBar.js';
import CodePreviewDialog from './components/dialogs/CodePreviewDialog.js';
import ProjectDialog from './components/dialogs/ProjectDialog.js';

function ToastContainer() {
  const { toasts } = useAppState();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);

  const openProjectDialog = useCallback(() => setShowProjectDialog(true), []);
  const closeProjectDialog = useCallback(() => setShowProjectDialog(false), []);
  const openCodePreview = useCallback(() => setShowCodePreview(true), []);
  const closeCodePreview = useCallback(() => setShowCodePreview(false), []);

  return (
    <ReactFlowProvider>
      <div className="app-layout">
        <Toolbar
          onOpenProjectDialog={openProjectDialog}
          onOpenCodePreview={openCodePreview}
        />
        <div className="app-main">
          <Palette />
          <Canvas />
          <PropertyPanel />
        </div>
        <StatusBar />
      </div>

      <ToastContainer />

      <ProjectDialog open={showProjectDialog} onClose={closeProjectDialog} />
      <CodePreviewDialog open={showCodePreview} onClose={closeCodePreview} />
    </ReactFlowProvider>
  );
}
